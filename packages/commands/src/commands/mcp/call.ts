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

function parseArgFlags(raw: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of raw) {
    const idx = item.indexOf("=");
    if (idx <= 0) {
      process.stderr.write(`Error: --arg must be in K=V form, got: ${item}\n`);
      process.exit(1);
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

export default defineCommand({
  description: "Call a tool on an MCP server (tools/call)",
  auth: "apiKey",
  usageArgs: "<server-code>.<tool> [--arg k=v ...] [--json '{...}'] [--url <url>]",
  options: [
    {
      flag: "<server-code>.<tool>",
      description:
        "Server code and tool name joined by a dot, e.g. market-cmapi00073529.SmartStockSelection",
      required: true,
    },
    {
      flag: "--arg <kv>",
      description: "Tool argument (repeatable). Values parsed as JSON if possible, else string.",
      type: "array",
    },
    {
      flag: "--json <obj>",
      description: "Full arguments object as JSON; merged with --arg (arg wins).",
    },
    {
      flag: "--query <text>",
      description: "Shortcut for --arg query=<text> (mirrors many DashScope MCP tools).",
    },
    { flag: "--url <url>", description: "Override the MCP endpoint URL (for non-Bailian servers)" },
  ],
  exampleArgs: [
    'market-cmapi00073529.SmartStockSelection --query "Screen consumer stocks with ROE > 15%"',
    'market-cmapi00073529.FinQuery --json \'{"q":"Guizhou Maotai","limit":5}\'',
    "market-cmapi00073529.SmartFundSelection --arg riskLevel=R3 --arg minScale=10",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const positional =
      ((flags as Record<string, unknown>)._positional as string[] | undefined) ?? [];
    const target = positional[0];
    if (!target) failIfMissing("<server-code>.<tool>", cmdUsage(config, "<server-code>.<tool>"));

    const dot = target!.indexOf(".");
    if (dot <= 0 || dot === target!.length - 1) {
      process.stderr.write(`Error: target must be <server-code>.<tool>, got "${target}".\n`);
      process.exit(1);
    }
    const serverCode = target!.slice(0, dot);
    const toolName = target!.slice(dot + 1);

    let toolArgs: Record<string, unknown> = {};
    if (flags.json) {
      try {
        const parsed = JSON.parse(flags.json as string);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          process.stderr.write("Error: --json must decode to an object.\n");
          process.exit(1);
        }
        toolArgs = parsed as Record<string, unknown>;
      } catch (err) {
        process.stderr.write(`Error: --json is not valid JSON — ${(err as Error).message}\n`);
        process.exit(1);
      }
    }
    Object.assign(toolArgs, parseArgFlags((flags.arg as string[] | undefined) ?? []));
    if (flags.query !== undefined) toolArgs.query = flags.query;

    const url = (flags.url as string) || bailianMcpUrl(config.baseUrl, serverCode);
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult(
        {
          server: serverCode,
          url,
          tool: toolName,
          arguments: toolArgs,
        },
        format,
      );
      return;
    }

    await ensureApiKey(config);
    const client = new McpClient(config, url);
    await client.initialize();
    const result = await client.callTool(toolName, toolArgs);

    if (result.isError) {
      const errText = result.content.map((c) => c.text || "").join("\n");
      process.stderr.write(`Tool error: ${errText}\n`);
      process.exit(1);
    }

    emitResult(result, format);
  },
});
