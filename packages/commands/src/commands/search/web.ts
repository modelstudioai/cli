import {
  defineCommand,
  BailianError,
  detectOutputFormat,
  mcpWebSearchPath,
  YouComMcpClient,
  type FlagsDef,
} from "bailian-cli-core";
import { createSpinner, emitResult } from "bailian-cli-runtime";
import { rethrowWithWebSearchActivateHint } from "./web-activate-hint.ts";

const WEB_SEARCH_FLAGS = {
  query: { type: "string", valueHint: "<text>", description: "Search query text" },
  count: {
    type: "number",
    valueHint: "<n>",
    description: "Number of search results (default: 10)",
  },
  listTools: { type: "switch", description: "List available MCP tools and exit" },
  provider: { 
    type: "string", 
    valueHint: "<name>", 
    description: "Search provider: 'dashscope' (default) or 'youcom'" 
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Search the web using DashScope WebSearch or You.com",
  auth: "optionalApiKey",
  usageArgs: "--query <text> [--provider <name>] [flags]",
  flags: WEB_SEARCH_FLAGS,
  exampleArgs: [
    '--query "Alibaba Cloud Bailian latest features"',
    '--query "TypeScript 5.9 new features" --count 5',
    '--query "Today\'s news" --provider youcom',
    '--query "AI developments" --provider dashscope',
    "--list-tools --provider youcom",
  ],
  validate: (f) => {
    if (!f.listTools && !f.query) return "Missing required flag: --query";
    if (f.provider && !["dashscope", "youcom"].includes(f.provider)) {
      return "Invalid provider. Use 'dashscope' or 'youcom'";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    
    // Determine provider
    const provider = flags.provider || "dashscope";
    const useYouCom = provider === "youcom";

    // --- List tools mode ---
    if (flags.listTools) {
      if (settings.dryRun) {
        const endpoint = useYouCom 
          ? "https://api.you.com" 
          : ctx.client.url(mcpWebSearchPath());
        emitResult({ endpoint, action: "tools/list", provider }, format);
        return;
      }

      try {
        if (useYouCom) {
          const config = YouComMcpClient.getConfig();
          const youcomClient = YouComMcpClient.fromClient(ctx.client, config.apiKey, config.baseUrl);
          await youcomClient.initialize();
          const tools = await youcomClient.listTools();
          emitResult({ tools, provider: "youcom" }, format);
        } else {
          const client = ctx.client.mcp(mcpWebSearchPath());
          await client.initialize();
          const tools = await client.listTools();
          emitResult({ tools, provider: "dashscope" }, format);
        }
      } catch (error) {
        if (useYouCom) {
          // You.com specific error handling
          if (error instanceof BailianError) throw error;
          throw new BailianError(`You.com search error: ${error instanceof Error ? error.message : 'Unknown error'}`, 1);
        } else {
          rethrowWithWebSearchActivateHint(error);
        }
      }
      return;
    }

    // --- Search mode ---
    const query = flags.query;

    if (settings.dryRun) {
      const endpoint = useYouCom 
        ? "https://api.you.com/api/search"
        : ctx.client.url(mcpWebSearchPath());
      const toolName = useYouCom ? "youcom_web_search" : "bailian_web_search";
      
      emitResult(
        {
          endpoint,
          action: "tools/call",
          tool: toolName,
          provider,
          arguments: {
            query: query!,
            count: flags.count || undefined,
          },
        },
        format,
      );
      return;
    }

    // Initialize appropriate client
    const spinner = createSpinner("Initializing search...");

    if (!settings.quiet) spinner.start();

    try {
      if (useYouCom) {
        // Use You.com MCP client
        const config = YouComMcpClient.getConfig();
        const youcomClient = YouComMcpClient.fromClient(ctx.client, config.apiKey, config.baseUrl);
        await youcomClient.initialize();

        if (!settings.quiet) spinner.update("Searching with You.com...");

        // Build tool arguments
        const toolArgs: Record<string, unknown> = { query: query! };
        if (flags.count) toolArgs.count = flags.count;

        // Call the search tool
        const result = await youcomClient.callTool("youcom_web_search", toolArgs);

        // Handle error response
        if (result.isError) {
          const errText = result.content.map((c) => c.text || "").join("\n");
          throw new BailianError(`You.com search error: ${errText}`);
        }

        if (!settings.quiet) spinner.stop("Done.");

        // Output results
        if (format === "json") {
          emitResult({ ...result, provider: "youcom" }, format);
        } else {
          // Text mode - You.com results are already formatted
          for (const item of result.content) {
            if (item.type === "text" && item.text) {
              emitResult({ text: item.text, provider: "youcom" }, format);
            }
          }
        }

      } else {
        // Use DashScope MCP client
        const client = ctx.client.mcp(mcpWebSearchPath());
        await client.initialize();

        if (!settings.quiet) spinner.update("Searching with DashScope...");

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
          emitResult({ ...result, provider: "dashscope" }, format);
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
                  emitResult({ pages: data.pages, total: data.pages.length, provider: "dashscope" }, format);
                } else {
                  emitResult({ ...data, provider: "dashscope" }, format);
                }
              } catch {
                emitResult({ text: item.text, provider: "dashscope" }, format);
              }
            }
          }
        }
      }
    } catch (error) {
      spinner.stop("Failed.");
      if (useYouCom) {
        // You.com specific error handling
        if (error instanceof BailianError) throw error;
        throw new BailianError(`You.com search error: ${error instanceof Error ? error.message : 'Unknown error'}`, 1);
      } else {
        rethrowWithWebSearchActivateHint(error);
      }
    }
  },
});
