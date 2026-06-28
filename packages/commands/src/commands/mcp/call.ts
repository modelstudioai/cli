import { defineCommand, bailianMcpPath, detectOutputFormat } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

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
  usageArgs: "--target <server.tool> [--arg k=v ...] [--json '{...}'] [--url <url>]",
  flags: {
    target: {
      type: "string",
      valueHint: "<server.tool>",
      description:
        "Server code and tool name joined by a dot, e.g. market-cmapi00073529.SmartStockSelection",
      required: true,
    },
    arg: {
      type: "array",
      valueHint: "<kv>",
      description: "Tool argument (repeatable). Values parsed as JSON if possible, else string.",
    },
    json: {
      type: "string",
      valueHint: "<obj>",
      description: "Full arguments object as JSON; merged with --arg (arg wins).",
    },
    query: {
      type: "string",
      valueHint: "<text>",
      description: "Shortcut for --arg query=<text> (mirrors many DashScope MCP tools).",
    },
    url: {
      type: "string",
      valueHint: "<url>",
      description: "Override the MCP endpoint URL (for non-Bailian servers)",
    },
  },
  exampleArgs: [
    '--target market-cmapi00073529.SmartStockSelection --query "Screen consumer stocks with ROE > 15%"',
    '--target market-cmapi00073529.FinQuery --json \'{"q":"Guizhou Maotai","limit":5}\'',
    "--target market-cmapi00073529.SmartFundSelection --arg riskLevel=R3 --arg minScale=10",
  ],
  async run(ctx) {
    const { config, flags } = ctx;
    const target = flags.target;

    const dot = target.indexOf(".");
    if (dot <= 0 || dot === target.length - 1) {
      process.stderr.write(`Error: target must be <server-code>.<tool>, got "${target}".\n`);
      process.exit(1);
    }
    const serverCode = target.slice(0, dot);
    const toolName = target.slice(dot + 1);

    let toolArgs: Record<string, unknown> = {};
    if (flags.json) {
      try {
        const parsed = JSON.parse(flags.json);
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
    Object.assign(toolArgs, parseArgFlags(flags.arg ?? []));
    if (flags.query !== undefined) toolArgs.query = flags.query;

    const url = flags.url || ctx.client.url(bailianMcpPath(serverCode));
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

    const client = ctx.client.mcp(url);
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
