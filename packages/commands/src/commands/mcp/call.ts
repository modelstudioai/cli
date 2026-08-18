import {
  defineCommand,
  UsageError,
  BailianError,
  bailianMcpPath,
  detectOutputFormat,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { rethrowWithMcpActivateHint } from "./activate-hint.ts";

const CALL_FLAGS = {
  target: {
    type: "string",
    valueHint: "<server.tool>",
    description: {
      "en-US":
        "Server code and tool name joined by a dot, e.g. market-cmapi00073529.SmartStockSelection",
      "zh-CN": "由点号连接的 Server Code 和工具名称，例如 market-cmapi00073529.SmartStockSelection",
    },
    required: true,
  },
  arg: {
    type: "array",
    valueHint: "<kv>",
    description: {
      "en-US": "Tool argument (repeatable). Values parsed as JSON if possible, else string.",
      "zh-CN": "工具参数（可重复）。值会优先按 JSON 解析，否则作为字符串。",
    },
  },
  json: {
    type: "string",
    valueHint: "<obj>",
    description: {
      "en-US": "Full arguments object as JSON; merged with --arg (arg wins).",
      "zh-CN": "完整的 JSON 参数对象；与 --arg 合并（--arg 优先）。",
    },
  },
  query: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Shortcut for --arg query=<text> (mirrors many DashScope MCP tools).",
      "zh-CN": "--arg query=<text> 的快捷方式（与许多 DashScope MCP 工具一致）。",
    },
  },
  url: {
    type: "string",
    valueHint: "<url>",
    description: {
      "en-US":
        "Override the MCP endpoint URL (non-Bailian). Tries Streamable HTTP first, then classic SSE on the same URL.",
      "zh-CN":
        "覆盖 MCP Endpoint URL（非百炼）。先尝试 Streamable HTTP，再在同一 URL 上回退到传统 SSE。",
    },
  },
} satisfies FlagsDef;
type CallFlags = ParsedFlags<typeof CALL_FLAGS>;

function parseTarget(target: string): { serverCode: string; toolName: string } {
  const dot = target.indexOf(".");
  if (dot <= 0 || dot === target.length - 1) {
    throw new UsageError(`target must be <server-code>.<tool>, got "${target}".`);
  }
  return { serverCode: target.slice(0, dot), toolName: target.slice(dot + 1) };
}

function parseArgFlags(raw: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0) {
      throw new UsageError(`--arg must be in K=V form, got: ${item}`);
    }
    const key = item.slice(0, idx).trim();
    const rawVal = item.slice(idx + 1);
    try {
      out[key] = JSON.parse(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

function parseJsonArg(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new UsageError(`--json is not valid JSON — ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError("--json must decode to an object.");
  }
  return parsed as Record<string, unknown>;
}

function buildToolArgs(flags: CallFlags): Record<string, unknown> {
  const toolArgs = flags.json ? parseJsonArg(flags.json) : {};
  Object.assign(toolArgs, parseArgFlags(flags.arg ?? []));
  if (flags.query !== undefined) toolArgs.query = flags.query;
  return toolArgs;
}

function validateCallFlags(flags: CallFlags): string | undefined {
  try {
    parseTarget(flags.target);
    buildToolArgs(flags);
  } catch (err) {
    if (err instanceof UsageError) return err.message;
    throw err;
  }
  return undefined;
}

export default defineCommand({
  description: {
    "en-US": "Call a tool on an MCP server (tools/call)",
    "zh-CN": "调用 MCP 服务器上的工具（tools/call）",
  },
  auth: "apiKey",
  usageArgs: "--target <server.tool> [--arg k=v ...] [--json '{...}'] [--url <url>]",
  flags: CALL_FLAGS,
  exampleArgs: [
    {
      "en-US":
        '--target market-cmapi00073529.SmartStockSelection --query "Screen consumer stocks with ROE > 15%"',
      "zh-CN":
        '--target market-cmapi00073529.SmartStockSelection --query "筛选 ROE 大于 15% 的消费股"',
    },
    {
      "en-US": '--target market-cmapi00073529.FinQuery --json \'{"q":"Guizhou Maotai","limit":5}\'',
      "zh-CN": '--target market-cmapi00073529.FinQuery --json \'{"q":"贵州茅台","limit":5}\'',
    },
    "--target market-cmapi00073529.SmartFundSelection --arg riskLevel=R3 --arg minScale=10",
  ],
  validate: validateCallFlags,
  async run(ctx) {
    const { settings, flags } = ctx;
    const { serverCode, toolName } = parseTarget(flags.target);
    const toolArgs = buildToolArgs(flags);

    const previewUrl = flags.url || ctx.client.url(bailianMcpPath(serverCode));
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          server: serverCode,
          url: previewUrl,
          tool: toolName,
          arguments: toolArgs,
        },
        format,
      );
      return;
    }

    let client: { close?(): void } | undefined;
    try {
      const connected = await ctx.client.connectBailianMcp(serverCode, flags.url);
      client = connected.client;
      const result = await connected.client.callTool(toolName, toolArgs);

      if (result.isError) {
        const errText = result.content.map((contentItem) => contentItem.text || "").join("\n");
        throw new BailianError(`Tool error: ${errText}`);
      }

      emitResult(result, format);
    } catch (error) {
      if (!flags.url) {
        rethrowWithMcpActivateHint(error, serverCode);
      }
      throw error;
    } finally {
      client?.close?.();
    }
  },
});
