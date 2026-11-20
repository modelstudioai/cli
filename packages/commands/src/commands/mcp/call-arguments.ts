import {
  UsageError,
  type CommandContext,
  type FlagsDef,
  type LocalizedText,
  type ParsedFlags,
} from "bailian-cli-core";

export const argumentFlags = {
  json: {
    type: "string",
    valueHint: "<obj>",
    description: {
      "en-US": "Base tool arguments as a JSON object",
      "zh-CN": "工具参数的基础 JSON 对象",
    },
  },
  arg: {
    type: "array",
    valueHint: "<k=v>",
    description: {
      "en-US":
        "Set a tool argument (repeatable). Values are parsed as JSON when possible and override --json.",
      "zh-CN": "设置工具参数（可重复）。值优先按 JSON 解析，覆盖 --json 中的同名键。",
    },
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Set the query argument to this text after applying --json and --arg",
      "zh-CN": "在 --json 和 --arg 合并后，将 query 参数设为此文本",
    },
  },
} satisfies FlagsDef;

type ArgumentFlags = ParsedFlags<typeof argumentFlags>;
type ParseResult =
  | { params: Record<string, unknown>; error?: never }
  | { error: LocalizedText; params?: never };

function parseArguments(flags: ArgumentFlags): ParseResult {
  // Business keys such as "__proto__" must be ordinary own properties.
  const params: Record<string, unknown> = Object.create(null);
  if (flags.json !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(flags.json);
    } catch {
      return {
        error: { "en-US": "--json is not valid JSON.", "zh-CN": "--json 不是有效的 JSON。" },
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        error: { "en-US": "--json must decode to an object.", "zh-CN": "--json 须为 JSON 对象。" },
      };
    }
    Object.assign(params, parsed);
  }
  for (const item of flags.arg ?? []) {
    const separator = item.indexOf("=");
    const key = item.slice(0, separator).trim();
    if (separator < 1 || !key) {
      return {
        error: {
          "en-US": "--arg must be in K=V form with a nonblank key.",
          "zh-CN": "--arg 须为 K=V 格式，键不能为空白。",
        },
      };
    }
    const value = item.slice(separator + 1);
    try {
      params[key] = JSON.parse(value);
    } catch {
      params[key] = value;
    }
  }
  if (flags.query !== undefined) params.query = flags.query;
  return { params };
}

export function validateArguments(flags: ArgumentFlags) {
  return parseArguments(flags).error;
}

export function toolArguments(flags: ArgumentFlags, localize: CommandContext["localize"]) {
  const result = parseArguments(flags);
  if (result.params === undefined) throw new UsageError(localize(result.error));
  return result.params;
}

export function toolErrorMessage(
  content: readonly { text?: string | null }[] | null,
  localize: CommandContext["localize"],
): string {
  const text = content
    ?.map((item) => item.text)
    .filter((value) => typeof value === "string" && value !== "")
    .join("\n");
  return (
    text || localize({ "en-US": "The MCP tool reported an error.", "zh-CN": "MCP 工具执行出错。" })
  );
}
