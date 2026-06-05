import { chatEndpoint } from "../client/endpoints.ts";
import { request, requestJson } from "../client/http.ts";
import { parseSSE } from "../client/stream.ts";
import type { Config } from "../config/schema.ts";
import type { ChatResponse, StreamChunk } from "../types/api.ts";
import {
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
        `名称: ${profile.name}`,
        `描述: ${profile.shortDescription || profile.description}`,
        `能力: ${profile.capabilities.join(", ")}`,
        `特性: ${profile.features.join(", ")}`,
      ];
      if (profile.contextWindow) parts.push(`上下文窗口: ${profile.contextWindow}`);
      if (profile.maxOutputTokens) parts.push(`最大输出: ${profile.maxOutputTokens}`);
      if (profile.category) parts.push(`类别: ${profile.category}`);
      const modality = profile.inferenceMetadata;
      if (modality?.request_modality?.length)
        parts.push(`输入模态: ${modality.request_modality.join(", ")}`);
      if (modality?.response_modality?.length)
        parts.push(`输出模态: ${modality.response_modality.join(", ")}`);
      const prices = formatPrices(profile);
      if (prices) parts.push(`定价: ${prices}`);
      const qpm = formatQpm(profile);
      if (qpm) parts.push(`QPM: ${qpm}`);
      if (profile.versionTag) parts.push(`版本: ${profile.versionTag}`);
      if (profile.openSource !== undefined) parts.push(`开源: ${profile.openSource ? "是" : "否"}`);
      if (profile.family) parts.push(`家族: ${profile.family}`);
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
  } = intent;
  const parts: string[] = [];
  if (taskSummary) parts.push(`场景理解: ${taskSummary}`);
  if (scenarioHints.length) parts.push(`场景特征: ${scenarioHints.join(", ")}`);
  if (inputModality.length) parts.push(`输入模态: ${inputModality.join(", ")}`);
  if (outputModality.length) parts.push(`输出模态: ${outputModality.join(", ")}`);
  if (requiredCapabilities.length) parts.push(`所需能力: ${requiredCapabilities.join(", ")}`);
  if (requiredFeatures.length) parts.push(`所需特性: ${requiredFeatures.join(", ")}`);
  parts.push(`预算倾向: ${budget}`);
  parts.push(`质量偏好: ${qualityPreference}`);
  if (contextNeed !== ContextNeeds.Standard) parts.push(`上下文需求: ${contextNeed}`);
  if (segments?.length) {
    parts.push(`拆解步骤:`);
    for (const seg of segments) {
      const inMod = seg.inputModality.join(",") || "无";
      const outMod = seg.outputModality.join(",") || "无";
      const caps = seg.requiredCapabilities.join(",") || "无";
      parts.push(`  - ${seg.step} (输入: ${inMod} → 输出: ${outMod}, 能力: ${caps})`);
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
          `${rec.name} 的输入模态 [${accepts.join(", ")}] 可能不兼容上一步的输出模态 [${[...prevOutputs].join(", ")}]`,
        );
      }
    }
    if (warnings.length > 0) {
      currStep.warnings = warnings;
    }
  }
}

export async function rankModels(
  config: Config,
  candidates: ScoredCandidate[],
  intent: IntentProfile,
  userInput: string,
  top: number,
  options?: RecommendOptions,
): Promise<RecommendResult> {
  const candidatesContext = buildCandidatesContext(candidates);
  const intentContext = buildIntentContext(intent);
  const systemPrompt =
    intent.complexity === Complexities.Pipeline ? PIPELINE_SYSTEM_PROMPT : SINGLE_SYSTEM_PROMPT;

  const useThinkingModel = options?.enableThinking ?? false;

  const userMessage =
    intent.complexity === Complexities.Pipeline
      ? `意图分析结果：\n${intentContext}\n\n候选模型列表：\n${candidatesContext}\n\n用户原始需求：${userInput}\n\n请为流水线各步骤各推荐最多 ${top} 个模型。`
      : `意图分析结果：\n${intentContext}\n\n候选模型列表：\n${candidatesContext}\n\n用户原始需求：${userInput}\n\n请推荐最多 ${top} 个模型。`;

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

  const url = chatEndpoint(config.baseUrl);
  let content: string;

  if (useThinkingModel) {
    const res = await request(config, {
      url,
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
    const response = await requestJson<ChatResponse>(config, {
      url,
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
