import {
  defineCommand,
  McpClient,
  bailianMcpUrl,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, cmdUsage } from "bailian-cli-runtime";
import { emitResult } from "bailian-cli-runtime";
import { ensureApiKey } from "bailian-cli-runtime";

export default defineCommand({
  description: "List tools exposed by an MCP server (tools/list)",
  auth: "apiKey",
  usageArgs: "<server-code> [--url <url>]",
  options: [
    {
      flag: "<server-code>",
      description: "Server code from `mcp list` (e.g. market-cmapi00073529)",
      required: true,
    },
    { flag: "--url <url>", description: "Override the MCP endpoint URL (for non-Bailian servers)" },
  ],
  exampleArgs: [
    "market-cmapi00073529",
    "market-cmapi00073529 --output json",
    "my-server --url https://example.com/mcp",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const positional =
      ((flags as Record<string, unknown>)._positional as string[] | undefined) ?? [];
    const code = positional[0];
    if (!code) failIfMissing("server-code", cmdUsage(config, "<server-code>"));

    const url = (flags.url as string) || bailianMcpUrl(config.baseUrl, code!);
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
