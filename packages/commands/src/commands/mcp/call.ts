import { defineCommand, BailianError, bailianMcpPath } from "bailian-cli-core";
import { rethrowWithMcpActivateHint } from "./activate-hint.ts";
import {
  argumentFlags,
  toolArguments,
  toolErrorMessage,
  validateArguments,
} from "./call-arguments.ts";
import { endpointFlag, validateEndpoint } from "./protocol-endpoint.ts";

function parseTarget(target: string) {
  const separator = target.indexOf(".");
  return {
    serverCode: separator < 0 ? "" : target.slice(0, separator),
    toolName: target.slice(separator + 1),
  };
}

export default defineCommand({
  description: {
    "en-US": "Open an MCP session and call a tool (tools/call)",
    "zh-CN": "建立 MCP 会话并调用工具（tools/call）",
  },
  auth: "apiKey",
  usageArgs:
    "--target <server.tool> [--arg k=v ...] [--json '{...}'] [--query <text>] [--url <url>]",
  flags: {
    target: {
      type: "string",
      required: true,
      valueHint: "<server.tool>",
      description: {
        "en-US": "Server code and tool name separated by the first dot",
        "zh-CN": "用第一个点号分隔服务编码和工具名称",
      },
    },
    ...argumentFlags,
    url: endpointFlag,
  },
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
  validate(flags) {
    const target = parseTarget(flags.target);
    if (!target.serverCode.trim() || !target.toolName.trim()) {
      return {
        "en-US": "--target must be <server-code>.<tool>.",
        "zh-CN": "--target 须为 <server-code>.<tool>。",
      };
    }
    return validateEndpoint(flags.url) ?? validateArguments(flags);
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const { serverCode, toolName } = parseTarget(flags.target);
    const toolArgs = toolArguments(flags, ctx.localize);

    const previewUrl = flags.url || ctx.client.url(bailianMcpPath(serverCode));

    if (settings.dryRun) {
      ctx.output.result({
        server: serverCode,
        url: previewUrl,
        tool: toolName,
        arguments: toolArgs,
      });
      return;
    }

    let client: { close?(): void } | undefined;
    let result;
    try {
      const connected = await ctx.client.connectBailianMcp(serverCode, flags.url);
      client = connected.client;
      result = await connected.client.callTool(toolName, toolArgs);
    } catch (error) {
      if (!flags.url) {
        rethrowWithMcpActivateHint(error, serverCode);
      }
      throw error;
    } finally {
      client?.close?.();
    }
    if (result.isError) throw new BailianError(toolErrorMessage(result.content, ctx.localize));
    ctx.output.result(result);
  },
});
