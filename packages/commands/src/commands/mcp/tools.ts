import { defineCommand, bailianMcpPath, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { rethrowWithMcpActivateHint } from "./activate-hint.ts";

export default defineCommand({
  description: {
    "en-US": "List tools exposed by an MCP server (tools/list)",
    "zh-CN": "列出 MCP 服务器提供的工具（tools/list）",
  },
  auth: "apiKey",
  usageArgs: "--server <code> [--url <url>]",
  flags: {
    server: {
      type: "string",
      valueHint: "<code>",
      description: {
        "en-US": "Server code from `mcp list` (e.g. market-cmapi00073529)",
        "zh-CN": "来自 `mcp list` 的 Server Code（例如 market-cmapi00073529）",
      },
      required: true,
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
  },
  exampleArgs: [
    "--server market-cmapi00073529",
    "--server market-cmapi00073529 --output json",
    "--server my-server --url https://example.com/mcp",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const code = flags.server;

    const previewUrl = flags.url || ctx.client.url(bailianMcpPath(code));
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ server: code, url: previewUrl, action: "tools/list" }, format);
      return;
    }

    let client: { close?(): void } | undefined;
    try {
      const connected = await ctx.client.connectBailianMcp(code, flags.url);
      client = connected.client;
      const tools = await connected.client.listTools();
      emitResult({ server: code, url: connected.url, tools }, format);
    } catch (error) {
      if (!flags.url) {
        rethrowWithMcpActivateHint(error, code);
      }
      throw error;
    } finally {
      client?.close?.();
    }
  },
});
