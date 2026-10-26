import type { LocalizedText } from "bailian-cli-core";

/** Business fields that require text; do not apply globally to optional/clearable flags. */
export function validateNonemptyFlags(
  fields: Record<string, string | readonly string[] | undefined>,
): LocalizedText | undefined {
  for (const [flag, value] of Object.entries(fields)) {
    const values = typeof value === "string" ? [value] : value;
    if (!values?.length || values.some((entry) => !entry.trim())) {
      return {
        "en-US": `--${flag} must not be empty or whitespace.`,
        "zh-CN": `--${flag} 不能为空或仅包含空白字符。`,
      };
    }
  }
  return undefined;
}
