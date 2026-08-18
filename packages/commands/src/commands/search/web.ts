import {
  defineCommand,
  BailianError,
  detectOutputFormat,
  mcpWebSearchPath,
  type FlagsDef,
} from "bailian-cli-core";
import { createSpinner, emitResult } from "bailian-cli-runtime";
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
    const format = detectOutputFormat(settings.output);

    // --- List tools mode ---
    if (flags.listTools) {
      if (settings.dryRun) {
        emitResult({ endpoint: ctx.client.url(mcpWebSearchPath()), action: "tools/list" }, format);
        return;
      }

      try {
        const client = ctx.client.mcp(mcpWebSearchPath());
        await client.initialize();
        const tools = await client.listTools();
        emitResult({ tools }, format);
      } catch (error) {
        rethrowWithWebSearchActivateHint(error);
      }
      return;
    }

    // --- Search mode ---
    const query = flags.query;

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: ctx.client.url(mcpWebSearchPath()),
          action: "tools/call",
          tool: "bailian_web_search",
          arguments: {
            query: query!,
            count: flags.count || undefined,
          },
        },
        format,
      );
      return;
    }

    // Initialize MCP client
    const client = ctx.client.mcp(mcpWebSearchPath());
    const spinner = createSpinner("Initializing search...");

    if (!settings.quiet) spinner.start();

    try {
      await client.initialize();

      if (!settings.quiet) spinner.update("Searching...");

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

      if (!settings.quiet) spinner.stop("Done.");

      // Output results — always structured to stdout
      if (format === "json") {
        emitResult(result, format);
      } else {
        // Text mode: try to extract pages for human-friendly display
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            try {
              const data = JSON.parse(item.text) as {
                pages?: Array<{
                  title?: string;
                  url?: string;
                  snippet?: string;
                  hostname?: string;
                }>;
              };
              if (data.pages && Array.isArray(data.pages)) {
                emitResult({ pages: data.pages, total: data.pages.length }, format);
              } else {
                emitResult(data, format);
              }
            } catch {
              emitResult({ text: item.text }, format);
            }
          }
        }
      }
    } catch (error) {
      spinner.stop("Failed.");
      rethrowWithWebSearchActivateHint(error);
    }
  },
});
