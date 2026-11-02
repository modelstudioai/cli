import {
  defineCommand,
  formatOutput,
  BailianError,
  mcpWebSearchPath,
  type FlagsDef,
  type McpConnectedClient,
} from "bailian-cli-core";

import { rethrowWithWebSearchActivateHint } from "./web-activate-hint.ts";

const WEB_SEARCH_FLAGS = {
  query: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Search query text", "zh-CN": "搜索查询文本" },
  },
  count: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Number of search results (default: 10)",
      "zh-CN": "搜索结果数量（默认：10）",
    },
  },
  listTools: {
    type: "switch",
    description: {
      "en-US": "List available MCP tools and exit",
      "zh-CN": "列出可用的 MCP 工具并退出",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Search the web using DashScope MCP WebSearch service",
    "zh-CN": "使用 DashScope MCP WebSearch 服务搜索互联网",
  },
  auth: "apiKey",
  usageArgs: "--query <text> [flags]",
  flags: WEB_SEARCH_FLAGS,
  exampleArgs: [
    {
      "en-US": '--query "Alibaba Cloud Bailian latest features"',
      "zh-CN": '--query "阿里云百炼最新功能"',
    },
    {
      "en-US": '--query "TypeScript 5.9 new features" --count 5',
      "zh-CN": '--query "TypeScript 5.9 新功能" --count 5',
    },
    {
      "en-US": '--query "Today\'s news"',
      "zh-CN": '--query "今日新闻"',
    },
    "--list-tools",
  ],
  validate: (f) => (!f.listTools && !f.query ? "Missing required flag: --query" : undefined),
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.output;

    // --- List tools mode ---
    if (flags.listTools) {
      if (settings.dryRun) {
        ctx.output.result({ endpoint: ctx.client.url(mcpWebSearchPath()), action: "tools/list" });
        return;
      }

      let client: McpConnectedClient | undefined;
      try {
        client = ctx.client.mcp(mcpWebSearchPath());
        await client.initialize();
        const tools = await client.listTools();
        ctx.output.result({ tools });
      } catch (error) {
        rethrowWithWebSearchActivateHint(error);
      } finally {
        // The SDK transport keeps a live SSE stream / pending sockets open;
        // without closing it the process never exits after emitting results.
        client?.close?.();
      }
      return;
    }

    // --- Search mode ---
    const query = flags.query;

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(mcpWebSearchPath()),
        action: "tools/call",
        tool: "bailian_web_search",
        arguments: {
          query: query!,
          count: flags.count || undefined,
        },
      });
      return;
    }

    // Initialize MCP client
    const client = ctx.client.mcp(mcpWebSearchPath());
    ctx.output.progress({ "en-US": "Initializing search...", "zh-CN": "正在初始化搜索……" });

    try {
      await client.initialize();

      ctx.output.progress({ "en-US": "Searching...", "zh-CN": "正在搜索……" });

      // Build tool arguments
      const toolArgs: Record<string, unknown> = { query: query! };
      if (flags.count) toolArgs.count = flags.count;

      // Call the search tool
      const result = await client.callTool("bailian_web_search", toolArgs);

      // Handle error response
      if (result.isError) {
        const errText = result.content.map((c) => c.text || "").join("\n");
        throw new BailianError(`Search error: ${errText}`);
      }

      ctx.output.progress({ "en-US": "Done.", "zh-CN": "已完成。" });

      let text: string | undefined;
      if (format === "text") {
        const parts: string[] = [];
        for (const item of result.content) {
          if (item.type !== "text" || !item.text) continue;
          let data: unknown;
          try {
            data = JSON.parse(item.text);
          } catch {
            data = { text: item.text };
          }
          const pages =
            data !== null && typeof data === "object" && "pages" in data
              ? (data as { pages: unknown }).pages
              : undefined;
          parts.push(
            formatOutput(Array.isArray(pages) ? { pages, total: pages.length } : data, "text"),
          );
        }
        text = parts.join("\n");
      }
      ctx.output.result(result, text === undefined ? undefined : { text });
    } catch (error) {
      ctx.output.progress({ "en-US": "Failed.", "zh-CN": "失败。" });
      rethrowWithWebSearchActivateHint(error);
    } finally {
      // Close on both paths: an open transport stream keeps the process alive.
      client.close?.();
    }
  },
});
