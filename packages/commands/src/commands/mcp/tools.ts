import { defineCommand, bailianMcpPath, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { rethrowWithMcpActivateHint } from "./activate-hint.ts";

export default defineCommand({
  description: "List tools exposed by an MCP server (tools/list)",
  auth: "apiKey",
  usageArgs: "--server <code> [--url <url>]",
  flags: {
    server: {
      type: "string",
      valueHint: "<code>",
      description: "Server code from `mcp list` (e.g. market-cmapi00073529)",
      required: true,
    },
    url: {
      type: "string",
      valueHint: "<url>",
      description: "Override the MCP endpoint URL (for non-Bailian servers)",
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
