import { chatPath } from "../client/endpoints.ts";
import { parseSSE } from "../client/stream.ts";
import type { Client } from "../client/client.ts";
import type { ChatResponse, StreamChunk } from "../types/api.ts";
import {
  ALTERNATIVE_SYSTEM_PROMPT,
  COMPARISON_SYSTEM_PROMPT,
  PIPELINE_SYSTEM_PROMPT,
  RANKING_MODEL,
  RANKING_MODEL_FAST,
  SINGLE_SYSTEM_PROMPT,
} from "./constants/prompts.ts";
import type { ScoredCandidate } from "./recall.ts";
import type {
  IntentProfile,
  ModelProfile,
  PipelineStep,
  RecommendedModel,
  RecommendResult,
} from "./types.ts";
import { Complexities, ContextNeeds } from "./types.ts";

export interface RecommendOptions {
  onThinking?: (text: string) => void;
  onContentStart?: () => void;
  enableThinking?: boolean;
}

function formatPrices(profile: ModelProfile): string | undefined {
  if (!profile.prices?.length) return undefined;
  return profile.prices.map((price) => `${price.type}:${price.price}/${price.unit}`).join(", ");
}

function formatQpm(profile: ModelProfile): string | undefined {
  if (!profile.qpmInfo) return undefined;
  const entries = Object.entries(profile.qpmInfo);
  if (entries.length === 0) return undefined;
  return entries
    .map(([key, limit]) => `${key}:${limit.count_limit}/${limit.count_limit_period}s`)
    .join(", ");
}

function buildCandidatesContext(candidates: ScoredCandidate[]): string {
  return candidates
    .map(({ model: profile }) => {
      const parts = [
        `ID: ${profile.model}`,
        `Name: ${profile.name}`,
        `Description: ${profile.shortDescription || profile.description}`,
        `Capabilities: ${profile.capabilities.join(", ")}`,
        `Features: ${profile.features.join(", ")}`,
      ];
      if (profile.contextWindow) parts.push(`Context Window: ${profile.contextWindow}`);
      if (profile.maxOutputTokens) parts.push(`Max Output: ${profile.maxOutputTokens}`);
      if (profile.category) parts.push(`Category: ${profile.category}`);
      const modality = profile.inferenceMetadata;
      if (modality?.request_modality?.length)
        parts.push(`Input Modality: ${modality.request_modality.join(", ")}`);
      if (modality?.response_modality?.length)
        parts.push(`Output Modality: ${modality.response_modality.join(", ")}`);
      const prices = formatPrices(profile);
      if (prices) parts.push(`Pricing: ${prices}`);
      const qpm = formatQpm(profile);
      if (qpm) parts.push(`QPM: ${qpm}`);
      if (profile.versionTag) parts.push(`Version: ${profile.versionTag}`);
      if (profile.openSource !== undefined)
        parts.push(`Open Source: ${profile.openSource ? "Yes" : "No"}`);
      if (profile.family) parts.push(`Family: ${profile.family}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function buildIntentContext(intent: IntentProfile): string {
  const {
    taskSummary,
    scenarioHints,
    inputModality,
    outputModality,
    requiredCapabilities,
    requiredFeatures,
    budget,
    qualityPreference,
    contextNeed,
    segments,
    modelPreference,
  } = intent;
  const parts: string[] = [];
  if (taskSummary) parts.push(`Task: ${taskSummary}`);
  if (scenarioHints.length) parts.push(`Scenario: ${scenarioHints.join(", ")}`);
  if (inputModality.length) parts.push(`Input: ${inputModality.join(", ")}`);
  if (outputModality.length) parts.push(`Output: ${outputModality.join(", ")}`);
  if (requiredCapabilities.length) parts.push(`Capabilities: ${requiredCapabilities.join(", ")}`);
  if (requiredFeatures.length) parts.push(`Features: ${requiredFeatures.join(", ")}`);
  parts.push(`Budget: ${budget}`);
  parts.push(`Quality: ${qualityPreference}`);
  if (contextNeed !== ContextNeeds.Standard) parts.push(`Context: ${contextNeed}`);
  if (modelPreference && modelPreference.mode !== "unconstrained") {
    parts.push(`Mode: ${modelPreference.mode}`);
    if (modelPreference.targets?.length)
      parts.push(`Targets: ${modelPreference.targets.join(", ")}`);
    if (modelPreference.excludes?.length)
      parts.push(`Excludes: ${modelPreference.excludes.join(", ")}`);
  }
  if (segments?.length) {
    parts.push(`Pipeline Steps:`);
    for (const seg of segments) {
      const inMod = seg.inputModality.join(",") || "none";
      const outMod = seg.outputModality.join(",") || "none";
      const caps = seg.requiredCapabilities.join(",") || "none";
      parts.push(`  - ${seg.step} (Input: ${inMod} → Output: ${outMod}, Capabilities: ${caps})`);
    }
  }
  return parts.join("\n");
}

export function buildDocLink(docUrl?: string): string | undefined {
  if (!docUrl) return undefined;
  const match = docUrl.match(/\/(\d+)\.html/);
  if (!match) return undefined;
  return `https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=${match[1]}`;
}

function buildRecommendations(
  items: any[],
  modelMap: Map<string, ModelProfile>,
  limit: number,
): RecommendedModel[] {
  const list = Array.isArray(items) ? items : [];
  const recommendations: RecommendedModel[] = [];
  const seenFamilies = new Set<string>();

  for (const item of list) {
    const profile = modelMap.get(item.model);
    if (!profile) continue;
    if (profile.family && seenFamilies.has(profile.family)) continue;
    if (profile.family) seenFamilies.add(profile.family);
    const { model, name, category, contextWindow, maxOutputTokens, docUrl } = profile;
    recommendations.push({
      model,
      name,
      reason: item.reason ?? "",
      highlights: item.highlights ?? [],
      category,
      contextWindow,
      maxOutputTokens,
      docUrl,
    });
    if (recommendations.length >= limit) break;
  }

  return recommendations;
}

function validatePipelineCompatibility(
  steps: PipelineStep[],
  modelMap: Map<string, ModelProfile>,
): void {
  for (let stepIdx = 1; stepIdx < steps.length; stepIdx++) {
    const prevStep = steps[stepIdx - 1];
    const currStep = steps[stepIdx];
    const prevOutputs = new Set(
      prevStep.recommendations.flatMap((rec) => {
        const profile = modelMap.get(rec.model);
        return profile?.inferenceMetadata?.response_modality ?? [];
      }),
    );

    if (prevOutputs.size === 0) continue;

    const warnings: string[] = [];
    for (const rec of currStep.recommendations) {
      const profile = modelMap.get(rec.model);
      const accepts = profile?.inferenceMetadata?.request_modality ?? [];
      const compatible = accepts.some((mod) => prevOutputs.has(mod));
      if (!compatible && accepts.length > 0) {
        warnings.push(
          `${rec.name}'s input modalities [${accepts.join(", ")}] may not be compatible with the previous step's output modalities [${[...prevOutputs].join(", ")}]`,
        );
      }
    }
    if (warnings.length > 0) {
      currStep.warnings = warnings;
    }
  }
}

export async function rankModels(
  client: Client,
  candidates: ScoredCandidate[],
  intent: IntentProfile,
  userInput: string,
  top: number,
  options?: RecommendOptions,
): Promise<RecommendResult> {
  const candidatesContext = buildCandidatesContext(candidates);
  const intentContext = buildIntentContext(intent);
  const preferenceMode = intent.modelPreference?.mode;

  let systemPrompt: string;
  if (preferenceMode === "comparison") {
    systemPrompt = COMPARISON_SYSTEM_PROMPT;
  } else if (preferenceMode === "alternative") {
    systemPrompt = ALTERNATIVE_SYSTEM_PROMPT;
  } else if (preferenceMode === "scoped") {
    const scopeNote = intent.modelPreference?.targets?.length
      ? `\n\n## Scope Restriction\nThe user explicitly requested recommendations from: ${intent.modelPreference.targets.join(", ")}. Prioritize models within this scope.`
      : "";
    systemPrompt =
      (intent.complexity === Complexities.Pipeline
        ? PIPELINE_SYSTEM_PROMPT
        : SINGLE_SYSTEM_PROMPT) + scopeNote;
  } else {
    systemPrompt =
      intent.complexity === Complexities.Pipeline ? PIPELINE_SYSTEM_PROMPT : SINGLE_SYSTEM_PROMPT;
  }

  const useThinkingModel = options?.enableThinking ?? false;

  const userMessage =
    intent.complexity === Complexities.Pipeline
      ? `Intent Analysis:\n${intentContext}\n\nCandidate Models:\n${candidatesContext}\n\nUser Request: ${userInput}\n\nRecommend up to ${top} models for each pipeline step. Respond in English only.`
      : `Intent Analysis:\n${intentContext}\n\nCandidate Models:\n${candidatesContext}\n\nUser Request: ${userInput}\n\nRecommend up to ${top} models. Respond in English only.`;

  const body: Record<string, unknown> = {
    model: useThinkingModel ? RANKING_MODEL : RANKING_MODEL_FAST,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 4096,
    temperature: 0,
  };

  if (useThinkingModel) {
    body.stream = true;
    body.enable_thinking = true;
  }

  const url = chatPath();
  let content: string;

  if (useThinkingModel) {
    const res = await client.request({
      path: url,
      method: "POST",
      body,
      stream: true,
    });

    let accumulated = "";
    let contentStarted = false;
    for await (const event of parseSSE(res)) {
      if (event.data === "[DONE]") break;
      try {
        const parsed = JSON.parse(event.data) as StreamChunk;
        for (const choice of parsed.choices) {
          const delta = choice.delta;
          if (delta.reasoning_content && options?.onThinking) {
            options.onThinking(delta.reasoning_content);
          }
          if (delta.content) {
            if (!contentStarted) {
              contentStarted = true;
              options?.onContentStart?.();
            }
            accumulated += delta.content;
          }
        }
      } catch {
        // skip unparseable chunks
      }
    }
    content = accumulated || "{}";
  } else {
    const response = await client.requestJson<ChatResponse>({
      path: url,
      method: "POST",
      body,
    });
    content = response.choices?.[0]?.message?.content ?? "{}";
  }

  let parsed: any;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
  } catch {
    return { type: Complexities.Single, recommendations: [] };
  }

  const modelMap = new Map(candidates.map(({ model: profile }) => [profile.model, profile]));

  if (parsed.type === Complexities.Pipeline && Array.isArray(parsed.steps)) {
    const steps: PipelineStep[] = [];
    for (const rawStep of parsed.steps) {
      const items = rawStep.recommendations ?? (rawStep.model ? [rawStep] : []);
      const recs = buildRecommendations(items, modelMap, top);
      if (recs.length > 0) {
        steps.push({ step: rawStep.step ?? "", recommendations: recs });
      }
    }
    validatePipelineCompatibility(steps, modelMap);
    return {
      type: Complexities.Pipeline,
      summary: parsed.summary ?? "",
      steps,
    };
  }

  const items = parsed.recommendations ?? parsed ?? [];
  const recommendations = buildRecommendations(items, modelMap, top);

  return { type: Complexities.Single, recommendations };
}
