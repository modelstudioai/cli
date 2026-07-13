import { chatPath } from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
import type { ChatResponse } from "../types/api.ts";
import { Complexities } from "./types.ts";
import type { IntentProfile, ModelPreference, PreferenceMode } from "./types.ts";
import { INTENT_EXTRACTION_MODEL, INTENT_SYSTEM_PROMPT } from "./constants/prompts.ts";
import { DEFAULT_INTENT } from "./constants/defaults.ts";

const VALID_MODES: readonly PreferenceMode[] = [
  "unconstrained",
  "scoped",
  "comparison",
  "alternative",
];

/**
 * Build a ModelPreference from the extraction model's raw output.
 * Returns undefined when no valid preference data is present.
 */
function extractModelPreference(
  raw: Record<string, unknown> | undefined,
): ModelPreference | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const mode: PreferenceMode =
    typeof raw.mode === "string" && VALID_MODES.includes(raw.mode as PreferenceMode)
      ? (raw.mode as PreferenceMode)
      : "unconstrained";

  const targets = Array.isArray(raw.targets)
    ? (raw.targets as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const excludes = Array.isArray(raw.excludes)
    ? (raw.excludes as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  return {
    mode,
    targets: targets.length > 0 ? targets : undefined,
    excludes: excludes.length > 0 ? excludes : undefined,
  };
}

/**
 * Analyze the user's input to produce an IntentProfile.
 *
 * Calls `qwen3.6-flash` via the OpenAI-compatible chat endpoint to extract
 * structured intent fields: taskSummary, modalities, capabilities, budget,
 * qualityPreference, modelPreference (mode/targets/excludes), and more.
 *
 * On failure, degrades gracefully to DEFAULT_INTENT with confidence 0.
 */
export async function analyzeIntent(client: Client, input: string): Promise<IntentProfile> {
  const url = chatPath();
  const body = {
    model: INTENT_EXTRACTION_MODEL,
    messages: [
      { role: "system" as const, content: INTENT_SYSTEM_PROMPT },
      { role: "user" as const, content: input },
    ],
    max_tokens: 1024,
    temperature: 0,
  };

  let response: ChatResponse;
  try {
    response = await client.requestJson<ChatResponse>({
      path: url,
      method: "POST",
      body,
      timeout: 30,
    });
  } catch {
    return { ...DEFAULT_INTENT };
  }

  const text = response.choices?.[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { ...DEFAULT_INTENT };
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const rawPref = parsed.modelPreference as Record<string, unknown> | undefined;
  const modelPreference = extractModelPreference(rawPref);

  const complexity =
    parsed.complexity === Complexities.Pipeline ? Complexities.Pipeline : Complexities.Single;

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
