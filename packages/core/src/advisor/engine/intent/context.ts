import type { IntentProfile } from "../types.ts";

function modalities(input: string[], output: string[]): string {
  return `${input.length ? input.join("/") : "?"} → ${output.length ? output.join("/") : "?"}`;
}

/**
 * Parsed-intent summary shared by every LLM stage downstream of intent
 * analysis (holistic scoring, recommendation reasons), so each stage judges
 * candidates against the same structured understanding instead of only the
 * raw user text. Includes the pipeline steps when the task is multi-step.
 */
export function formatIntentContext(intent: IntentProfile): string {
  const lines: string[] = [];
  if (intent.taskSummary) lines.push(`Task: ${intent.taskSummary}`);
  lines.push(`Complexity: ${intent.complexity}`);

  const steps = intent.complexity === "pipeline" ? (intent.segments ?? []) : [];
  if (steps.length > 0) {
    lines.push("Steps:");
    steps.forEach((seg, idx) => {
      const caps = seg.requiredCapabilities.length
        ? ` [${seg.requiredCapabilities.join(", ")}]`
        : "";
      lines.push(
        `  ${idx + 1}. ${seg.step || "step"}: ${modalities(seg.inputModality, seg.outputModality)}${caps}`,
      );
    });
  }

  lines.push(`Modality: ${modalities(intent.inputModality, intent.outputModality)}`);
  if (intent.requiredCapabilities.length)
    lines.push(`Capabilities: ${intent.requiredCapabilities.join(", ")}`);
  if (intent.requiredFeatures.length) lines.push(`Features: ${intent.requiredFeatures.join(", ")}`);
  if (intent.matchedScenes.length) lines.push(`Scenes: ${intent.matchedScenes.join(", ")}`);
  if (intent.scenarioHints.length) lines.push(`Hints: ${intent.scenarioHints.join(", ")}`);
  lines.push(`Budget: ${intent.budget}`);
  lines.push(`Quality: ${intent.qualityPreference}`);
  if (intent.contextNeed !== "standard") lines.push(`Context need: ${intent.contextNeed}`);
  const excludes = intent.modelPreference?.excludes ?? [];
  if (excludes.length) lines.push(`Excluded by user: ${excludes.join(", ")}`);
  return lines.join("\n");
}
