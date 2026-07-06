import { chatPath } from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
import type { ChatResponse } from "../types/api.ts";
import { Complexities } from "./types.ts";
import type { IntentProfile } from "./types.ts";
import { INTENT_MODEL, INTENT_SYSTEM_PROMPT } from "./constants/prompts.ts";
import { DEFAULT_INTENT } from "./constants/defaults.ts";

export async function analyzeIntent(client: Client, input: string): Promise<IntentProfile> {
  const url = chatPath();

  const body = {
    model: INTENT_MODEL,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: input },
    ],
    max_tokens: 1024,
    temperature: 0,
  };

  try {
    const response = await client.requestJson<ChatResponse>({
      path: url,
      method: "POST",
      body,
      timeout: 5000,
    });

    const content = response.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_INTENT;

    const parsed = JSON.parse(jsonMatch[0]);
    const VALID_MODES = ["scoped", "comparison", "alternative"] as const;
    const rawPref = parsed.modelPreference as Record<string, unknown> | undefined;
    const modelPreference =
      rawPref && typeof rawPref === "object"
        ? {
            mode: VALID_MODES.includes(rawPref.mode as (typeof VALID_MODES)[number])
              ? (rawPref.mode as (typeof VALID_MODES)[number])
              : ("unconstrained" as const),
            targets: Array.isArray(rawPref.targets) ? (rawPref.targets as string[]) : undefined,
            excludes: Array.isArray(rawPref.excludes) ? (rawPref.excludes as string[]) : undefined,
          }
        : undefined;

    return {
      complexity:
        parsed.complexity === Complexities.Pipeline ? Complexities.Pipeline : Complexities.Single,
      taskSummary: typeof parsed.taskSummary === "string" ? parsed.taskSummary : "",
      scenarioHints: Array.isArray(parsed.scenarioHints) ? parsed.scenarioHints : [],
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
  } catch {
    return DEFAULT_INTENT;
  }
}
