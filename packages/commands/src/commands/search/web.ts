import {
  defineCommand,
  formatOutput,
  BailianError,
  chatPath,
  mcpWebSearchPath,
  type ChatRequest,
  type ChatResponse,
  type FlagsDef,
  type McpConnectedClient,
  type McpToolResult,
} from "bailian-cli-core";

import { rethrowWithWebSearchActivateHint } from "./web-activate-hint.ts";

/** Fallback model for --mode model, mirroring the text-chat default chain. */
const DEFAULT_SEARCH_MODEL = "qwen3.8-max";

type WebSearchMode = "mcp" | "model";

/**
 * Resolve the effective search mode. `--list-tools` is an MCP-only concept and
 * locks the mode to mcp; otherwise default to model (Chat Completions) unless
 * `--mode mcp` is given.
 */
function resolveSearchMode(flags: { mode?: string; listTools?: boolean }): WebSearchMode {
  if (flags.listTools) return "mcp";
  return flags.mode === "mcp" ? "mcp" : "model";
}

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
  mode: {
    type: "string",
    valueHint: "<mcp|model>",
    choices: ["mcp", "model"] as const,
    description: {
      "en-US":
        "Search mode: model answers via Chat Completions with enable_search, mcp calls the WebSearch MCP service (default: model)",
      "zh-CN":
        "搜索模式：model 通过 Chat Completions（enable_search）由模型联网作答，mcp 调用 WebSearch MCP 服务（默认：model）",
    },
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Model ID for --mode model (default: qwen3.8-max)",
      "zh-CN": "--mode model 使用的模型 ID（默认：qwen3.8-max）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US":
      "Search the web via a chat model with built-in web search (default) or the DashScope MCP WebSearch service",
    "zh-CN": "搜索互联网：默认走模型内置联网搜索，也可切换为 DashScope MCP WebSearch 服务",
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
      "en-US": '--query "Today\'s news"',
      "zh-CN": '--query "今日新闻"',
    },
    {
      "en-US": '--mode mcp --query "TypeScript 5.9 new features" --count 5',
      "zh-CN": '--mode mcp --query "TypeScript 5.9 新功能" --count 5',
    },
    {
      "en-US": '--mode mcp --query "Alibaba Cloud Bailian latest features"',
      "zh-CN": '--mode mcp --query "阿里云百炼最新功能"',
    },
    "--list-tools",
  ],
  notes: [
    {
      "en-US":
        "Defaults to --mode model: one non-streaming Chat Completions request with enable_search: true, returning the model answer as a single content[].text block (no pages list). Use --mode mcp for the WebSearch MCP service (pages list); --count and --list-tools are MCP-mode only. The model resolves from --model, default_text_model, then qwen3.8-max.",
      "zh-CN":
        "默认 --mode model：发送单次非流式 Chat Completions 请求（enable_search: true），模型回答以单个 content[].text 块返回（无 pages 列表）。--mode mcp 走 WebSearch MCP 服务（返回 pages）；--count 与 --list-tools 仅限 MCP 模式。模型按 --model、default_text_model、qwen3.8-max 依次解析。",
    },
  ],
  validate: (flags) => {
    if (flags.mode === "model" && flags.listTools) {
      return "--list-tools is only available in MCP mode (--mode mcp). / --list-tools 仅支持 MCP 模式（--mode mcp）。";
    }
    if (resolveSearchMode(flags) === "model" && flags.count !== undefined) {
      return "--count is only available in MCP mode (--mode mcp). / --count 仅支持 MCP 模式（--mode mcp）。";
    }
    if (!flags.listTools && !flags.query) return "Missing required flag: --query";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.output;

    // --- Model mode (default): Chat Completions with enable_search ---
    if (resolveSearchMode(flags) === "model") {
      const model = flags.model || settings.defaultTextModel || DEFAULT_SEARCH_MODEL;
      const request: ChatRequest = {
        model,
        messages: [{ role: "user", content: flags.query! }],
        enable_search: true,
        stream: false,
      };

      if (settings.dryRun) {
        ctx.output.result({ endpoint: ctx.client.url(chatPath()), request });
        return;
      }

      ctx.output.progress({ "en-US": "Searching...", "zh-CN": "正在搜索……" });
      try {
        const response = await ctx.client.requestJson<ChatResponse>({
          path: chatPath(),
          method: "POST",
          body: request,
        });
        const answer = response.choices?.[0]?.message?.content ?? "";
        ctx.output.progress({ "en-US": "Done.", "zh-CN": "已完成。" });
        // Keep the MCP result envelope so downstream parsers work for both modes.
        const result: McpToolResult = {
          content: [{ type: "text", text: answer }],
          isError: false,
        };
        ctx.output.result(result, format === "text" ? { text: answer } : undefined);
      } catch (error) {
        ctx.output.progress({ "en-US": "Failed.", "zh-CN": "失败。" });
        throw error;
      }
      return;
    }

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
