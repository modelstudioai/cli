import type { DashScopeTaskResponse } from "bailian-cli-core";

/** Image URLs from one async task: use choices when present, otherwise results. */
export function collectTaskImageUrls(output: DashScopeTaskResponse["output"]): string[] {
  const fromChoices = (output.choices ?? [])
    .flatMap((choice) => choice.message?.content ?? [])
    .map((item) => item.image)
    .filter(Boolean);
  if (fromChoices.length > 0) return fromChoices;
  return (output.results ?? []).map((item) => item.url).filter(Boolean);
}
