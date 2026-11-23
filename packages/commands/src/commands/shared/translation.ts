import { BailianError, ExitCode, type LocalizedText } from "bailian-cli-core";

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function hasNonAscii(value: string): boolean {
  for (const char of value) {
    if ((char.codePointAt(0) ?? 0) > 0x7f) return true;
  }
  return false;
}

/** Parse repeatable `--term source=target` flags into source/target pairs. */
export function parseTermPairs(
  terms: string[] | undefined,
  localize: (text: LocalizedText) => string,
): Array<{ source: string; target: string }> | undefined {
  if (terms === undefined) return undefined;
  const parsed: Array<{ source: string; target: string }> = [];
  for (const termValue of terms) {
    const equalsIndex = termValue.indexOf("=");
    if (equalsIndex <= 0 || equalsIndex === termValue.length - 1) {
      throw new BailianError(
        localize({
          "en-US": `Invalid --term "${termValue}". Use source=target with non-empty sides.`,
          "zh-CN": `无效的 --term "${termValue}"。请使用 source=target，且两侧均非空。`,
        }),
        ExitCode.USAGE,
      );
    }
    parsed.push({
      source: termValue.slice(0, equalsIndex),
      target: termValue.slice(equalsIndex + 1),
    });
  }
  return parsed;
}
