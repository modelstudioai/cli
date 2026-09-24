import { readFileSync } from "node:fs";
import { BailianError, ExitCode, type FlagsDef, type LocalizedText } from "bailian-cli-core";

export const PARSER_FLAGS = {
  parser: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "File parser (e.g. AUTO_SELECT or DOCMIND_LLM_VERSION_MEDIA)",
      "zh-CN": "文件解析器（如 AUTO_SELECT 或 DOCMIND_LLM_VERSION_MEDIA）",
    },
  },
  parserConfigFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON object containing parser configuration",
      "zh-CN": "解析器配置 JSON 对象文件",
    },
  },
} satisfies FlagsDef;

export function readParserOptions(
  flags: { parser?: string; parserConfigFile?: string },
  localize: (text: LocalizedText) => string,
): { parser?: string; parserConfig?: Record<string, unknown> } {
  const result: { parser?: string; parserConfig?: Record<string, unknown> } = {};
  if (flags.parser !== undefined) result.parser = flags.parser;
  if (flags.parserConfigFile !== undefined) {
    // Preserve filesystem errno; the runtime provides the usual I/O diagnostic.
    const content = readFileSync(flags.parserConfigFile, "utf8");
    let config: unknown;
    try {
      config = JSON.parse(content);
    } catch {
      throw new BailianError(
        localize({
          "en-US": "Parser configuration must be valid JSON.",
          "zh-CN": "解析器配置必须是合法 JSON。",
        }),
        ExitCode.USAGE,
      );
    }
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      throw new BailianError(
        localize({
          "en-US": "Parser configuration must be a JSON object.",
          "zh-CN": "解析器配置必须是 JSON 对象。",
        }),
        ExitCode.USAGE,
      );
    }
    result.parserConfig = config as Record<string, unknown>;
  }
  return result;
}
