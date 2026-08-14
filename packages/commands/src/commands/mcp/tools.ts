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
      description:
        "Override the MCP endpoint URL (non-Bailian). Tries Streamable HTTP first, then classic SSE on the same URL.",
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
