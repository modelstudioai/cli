import { defineCommand, McpClient, bailianMcpUrl, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { ensureApiKey } from "bailian-cli-runtime";

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
  async run(config, flags) {
    const code = flags.server;

    const url = flags.url || bailianMcpUrl(config.baseUrl, code);
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ server: code, url, action: "tools/list" }, format);
      return;
    }

    await ensureApiKey(config);
    const client = new McpClient(config, url);
    await client.initialize();
    const tools = await client.listTools();
    emitResult({ server: code, url, tools }, format);
  },
});
