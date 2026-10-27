/**
 * Best-effort extraction + parse of a JSON object from an LLM response.
 * Steps:
 *   1. strip ```json / ``` code fences
 *   2. try JSON.parse on the whole string
 *   3. fall back to the substring from the first `{` to the last `}`
 *   4. apply light repair (trailing commas) and retry
 * Throws when no valid JSON can be recovered — callers should combine
 * this with a retry or fallback strategy.
 */
export function extractJson(content: string): unknown {
  const text = content ?? "";

  const fenced = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();

  try {
    return JSON.parse(fenced);
  } catch {
    // continue
  }

  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = fenced.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // continue to repair
    }

    const repaired = slice.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      // give up
    }
  }

  throw new Error("Failed to extract valid JSON from LLM response");
}
