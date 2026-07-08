/**
 * Best-effort extraction + parse of a JSON object from an LLM response.
 *
 * Replaces the previous greedy regex `content.match(/\{[\s\S]*\}/)` which
 * breaks when the model wraps output in a markdown code fence or emits
 * multiple JSON fragments. Steps:
 *   1. strip ```json / ``` code fences
 *   2. try JSON.parse on the whole string
 *   3. fall back to the substring from the first `{` to the last `}`
 *   4. apply light repair (trailing commas) and retry
 * Throws when no valid JSON can be recovered — callers should combine
 * this with `withRetry` to re-invoke the model on failure.
 */
export function extractJson(content: string): unknown {
  const text = content ?? "";

  // 1. strip markdown code fences
  const fenced = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();

  // 2. try the whole thing
  try {
    return JSON.parse(fenced);
  } catch {
    // continue
  }

  // 3. substring from first '{' to last '}'
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = fenced.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // continue to repair
    }

    // 4. light repair: remove trailing commas before ] or }
    const repaired = slice.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      // give up
    }
  }

  throw new Error("Failed to extract valid JSON from LLM response");
}
