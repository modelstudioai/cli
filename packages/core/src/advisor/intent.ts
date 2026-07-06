import { requestJson } from "../client/http.ts";
import { chatEndpoint, intentDetectEndpoint } from "../client/endpoints.ts";
import type { Config } from "../config/schema.ts";
import type { ChatResponse, DashScopeIntentDetectResponse } from "../types/api.ts";
import { Complexities } from "./types.ts";
import type { IntentProfile, ModelPreference, PreferenceMode } from "./types.ts";
import {
  INTENT_DETECT_MODEL,
  buildIntentDetectSystemPrompt,
  INTENT_EXTRACTION_MODEL,
  INTENT_SYSTEM_PROMPT,
} from "./constants/prompts.ts";
import { DEFAULT_INTENT } from "./constants/defaults.ts";

// ---- tongyi-intent-detect-v3: fast mode classification via DashScope native API

const VALID_MODES: readonly PreferenceMode[] = [
  "unconstrained",
  "scoped",
  "comparison",
  "alternative",
];

/** Seconds per attempt; http.ts multiplies by 1000 -> ms. */
const INTENT_DETECT_TIMEOUT = 10;

/**
 * Result of the fast intent-detect pass. Only the fields that
 * `tongyi-intent-detect-v3` reliably extracts -- the remaining IntentProfile
 * fields are still filled by the qwen3.6-flash extraction path.
 */
interface IntentDetectResult {
  mode: PreferenceMode;
  targets: string[];
  excludes: string[];
  complexity: "single" | "pipeline";
}

/**
 * Parse the tags block from the detect model's response.
 * Returns the trimmed tag content, or "" when no tag is found.
 */
function parseTags(content: string): string {
  const re = /<tags>\s*([\s\S]*?)\s*<\/tags>/i;
  const match = content.match(re);
  return match ? match[1].trim() : "";
}

/**
 * Parse the tool_call block from the detect model's response.
 * Returns the first tool call's arguments, or null when not found.
 */
function parseToolCall(content: string): Record<string, unknown> | null {
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;
  const match = content.match(re);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].arguments) {
      return parsed[0].arguments as Record<string, unknown>;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "arguments" in (parsed as Record<string, unknown>)
    ) {
      return (parsed as Record<string, unknown>).arguments as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract string[] helper for safe array extraction from unknown values.
 */
function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Call `tongyi-intent-detect-v3` via DashScope native API for fast classification.
 *
 * Uses INTENT_MODE: the model emits `<tags>mode</tags>` for classification
 * plus a `classify_intent` tool_call carrying targets/excludes/complexity.
 * Returns null on any failure; caller falls back to extraction model fields.
 */
async function detectIntentMode(config: Config, input: string): Promise<IntentDetectResult | null> {
  const baseUrl = config.intentDetectBaseUrl ?? config.baseUrl;
  const url = intentDetectEndpoint(baseUrl);

  // Build system prompt following the official template:
  // tools JSON is embedded in the prompt text, NOT passed via request body.
  const systemPrompt = buildIntentDetectSystemPrompt();

  // DashScope-native request shape: { model, input, parameters }
  const body = {
    model: INTENT_DETECT_MODEL,
    input: {
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: input },
      ],
    },
    parameters: {
      result_format: "message" as const,
      max_tokens: 512,
      temperature: 0,
    },
  };

  try {
    const response = await requestJson<DashScopeIntentDetectResponse>(config, {
      url,
      method: "POST",
      body,
      timeout: INTENT_DETECT_TIMEOUT,
    });

    const text = response.output?.choices?.[0]?.message?.content ?? "";

    // 1. Extract mode from <tags>
    const tag = parseTags(text);
    const mode: PreferenceMode = VALID_MODES.includes(tag as PreferenceMode)
      ? (tag as PreferenceMode)
      : "unconstrained";

    // 2. Extract structured fields from <tool_call>
    const args = parseToolCall(text);
    const targets = args ? safeStringArray(args.targets) : [];
    const excludes = args ? safeStringArray(args.excludes) : [];
    const rawComplexity = args?.complexity;
    const complexity = rawComplexity === "pipeline" ? ("pipeline" as const) : ("single" as const);

    return { mode, targets, excludes, complexity };
  } catch {
    // detect-v3 failure is non-fatal: caller falls back to extraction model fields
    return null;
  }
}

/**
 * Merge detect-v3 and extraction model results into a single ModelPreference.
 * detect-v3 wins on mode/targets/excludes; extraction model is the fallback.
 */
function buildModelPreference(
  detect: IntentDetectResult | null,
  extractionFallback?: { mode: PreferenceMode; targets: string[]; excludes: string[] },
): ModelPreference | undefined {
  if (detect) {
    return {
      mode: detect.mode,
      targets: detect.targets.length > 0 ? detect.targets : undefined,
      excludes: detect.excludes.length > 0 ? detect.excludes : undefined,
    };
  }
  if (extractionFallback) {
    return {
      mode: extractionFallback.mode,
      targets: extractionFallback.targets.length > 0 ? extractionFallback.targets : undefined,
      excludes: extractionFallback.excludes.length > 0 ? extractionFallback.excludes : undefined,
    };
  }
  return undefined;
}

// ---- Main entry: parallel detect-v3 + qwen3.6-flash ------------------------

/**
 * Analyze the user's input to produce an IntentProfile.
 *
 * Two LLM calls run in parallel:
 *   1. `tongyi-intent-detect-v3` (DashScope native) -- fast mode/targets/excludes/complexity
 *   2. `qwen3.6-flash` -- rich field extraction (taskSummary, modalities, budget, etc.)
 *
 * detect-v3 takes priority for mode/targets/excludes/complexity;
 * the extraction model fills everything else.
 */
export async function analyzeIntent(config: Config, input: string): Promise<IntentProfile> {
  const detectPromise = detectIntentMode(config, input);

  const url = chatEndpoint(config.baseUrl);
  const body = {
    model: INTENT_EXTRACTION_MODEL,
    messages: [
      { role: "system" as const, content: INTENT_SYSTEM_PROMPT },
      { role: "user" as const, content: input },
    ],
    max_tokens: 1024,
    temperature: 0,
  };

  const extractionPromise = requestJson<ChatResponse>(config, {
    url,
    method: "POST",
    body,
    timeout: 30,
  });

  const [detectResult, extractionResponse] = await Promise.all([
    detectPromise,
    extractionPromise.catch(() => null),
  ]);

  // If extraction model failed, use detect-v3 result + defaults
  if (!extractionResponse) {
    return {
      ...DEFAULT_INTENT,
      modelPreference: buildModelPreference(detectResult),
      complexity:
        detectResult?.complexity === "pipeline" ? Complexities.Pipeline : Complexities.Single,
    };
  }

  const text = extractionResponse.choices?.[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      ...DEFAULT_INTENT,
      confidence: detectResult ? 1 : 0,
      modelPreference: buildModelPreference(detectResult),
      complexity:
        detectResult?.complexity === "pipeline" ? Complexities.Pipeline : Complexities.Single,
    };
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Extraction model's mode/targets/excludes (fallback when detect-v3 is null)
  const rawPref = parsed.modelPreference as Record<string, unknown> | undefined;
  const extractionMode: PreferenceMode =
    rawPref && typeof rawPref === "object" && typeof rawPref.mode === "string"
      ? VALID_MODES.includes(rawPref.mode as PreferenceMode)
        ? (rawPref.mode as PreferenceMode)
        : "unconstrained"
      : "unconstrained";
  const extractionTargets: string[] =
    rawPref && typeof rawPref === "object" && Array.isArray(rawPref.targets)
      ? (rawPref.targets as string[])
      : [];
  const extractionExcludes: string[] =
    rawPref && typeof rawPref === "object" && Array.isArray(rawPref.excludes)
      ? (rawPref.excludes as string[])
      : [];

  // Merge: detect-v3 wins, extraction model fills gaps
  const modelPreference = buildModelPreference(detectResult, {
    mode: extractionMode,
    targets: extractionTargets,
    excludes: extractionExcludes,
  });

  // Extraction model complexity, but detect-v3 pipeline tag overrides
  const extractionComplexity =
    parsed.complexity === Complexities.Pipeline ? Complexities.Pipeline : Complexities.Single;
  const complexity =
    detectResult?.complexity === "pipeline" ? Complexities.Pipeline : extractionComplexity;

  return {
    complexity,
    taskSummary: typeof parsed.taskSummary === "string" ? parsed.taskSummary : "",
    scenarioHints: Array.isArray(parsed.scenarioHints) ? parsed.scenarioHints : [],
    semanticQuery: typeof parsed.semanticQuery === "string" ? parsed.semanticQuery : "",
    segments: Array.isArray(parsed.segments)
      ? parsed.segments.map((seg: Record<string, unknown>) => ({
          step: (seg.step as string) ?? "",
          inputModality: Array.isArray(seg.inputModality) ? seg.inputModality : [],
          outputModality: Array.isArray(seg.outputModality) ? seg.outputModality : [],
          requiredCapabilities: Array.isArray(seg.requiredCapabilities)
            ? seg.requiredCapabilities
            : [],
        }))
      : undefined,
    inputModality: Array.isArray(parsed.inputModality) ? parsed.inputModality : [],
    outputModality: Array.isArray(parsed.outputModality) ? parsed.outputModality : [],
    requiredCapabilities: Array.isArray(parsed.requiredCapabilities)
      ? parsed.requiredCapabilities
      : [],
    requiredFeatures: Array.isArray(parsed.requiredFeatures) ? parsed.requiredFeatures : [],
    budget: parsed.budget ?? DEFAULT_INTENT.budget,
    contextNeed: parsed.contextNeed ?? DEFAULT_INTENT.contextNeed,
    qualityPreference: parsed.qualityPreference ?? DEFAULT_INTENT.qualityPreference,
    confidence: 1,
    modelPreference,
  };
}
