import { BailianError, defineCommand, bailianMcpPath, type McpTool } from "bailian-cli-core";
import { rethrowWithMcpActivateHint } from "./activate-hint.ts";
import { validateServer } from "./server-management.ts";
import { endpointFlag, validateEndpoint } from "./protocol-endpoint.ts";

export default defineCommand({
  description: {
    "en-US": "Open an MCP session and list the server's tools (tools/list)",
    "zh-CN": "建立 MCP 会话并列出服务提供的工具（tools/list）",
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
    url: endpointFlag,
  },
  exampleArgs: [
    "--server market-cmapi00073529",
    "--server market-cmapi00073529 --output json",
    "--server my-server --url https://example.com/mcp",
  ],
  validate({ server, url }) {
    return validateServer(server) ?? validateEndpoint(url);
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const code = flags.server;

    if (settings.dryRun) {
      const url = flags.url || ctx.client.baseUrl + bailianMcpPath(code);
      ctx.output.result({ server: code, url, action: "tools/list" });
      return;
    }

    let client: { close?(): void } | undefined;
    try {
      const connected = await ctx.client.connectBailianMcp(code, flags.url);
      client = connected.client;
      const tools: McpTool[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      for (;;) {
        const page = await connected.client.listToolsPage(cursor);
        for (const tool of page.tools) tools.push(tool);
        cursor = page.nextCursor;
        if (cursor === undefined) break;
        if (seenCursors.has(cursor)) {
          throw new BailianError(
            ctx.localize({
              "en-US": "The MCP server returned a repeated tools/list cursor.",
              "zh-CN": "MCP 服务返回了重复的 tools/list 分页游标。",
            }),
          );
        }
        seenCursors.add(cursor);
      }
      ctx.output.result({ server: code, url: connected.url, tools });
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
