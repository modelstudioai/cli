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
        "en-US": "Override the MCP endpoint URL (for non-Bailian servers)",
        "zh-CN": "覆盖 MCP Endpoint URL（用于非百炼服务器）",
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

    const url = flags.url || ctx.client.url(bailianMcpPath(code));
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ server: code, url, action: "tools/list" }, format);
      return;
    }

    const client = ctx.client.mcp(url);
    try {
      await client.initialize();
      const tools = await client.listTools();
      emitResult({ server: code, url, tools }, format);
    } catch (error) {
      if (!flags.url) {
        rethrowWithMcpActivateHint(error, code);
      }
      throw error;
    }
  },
});
