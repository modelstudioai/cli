import {
  defineCommand,
  detectOutputFormat,
  mcpWebSearchEndpoint,
  isInteractive,
  McpClient,
} from "bailian-cli-core";
import { createSpinner } from "../../output/progress.ts";
import { promptText, failIfMissing } from "../../output/prompt.ts";
import { emitResult } from "../../output/output.ts";

export default defineCommand({
  name: "search web",
  description: "Search the web using DashScope MCP WebSearch service",
  usage: "bl search web --query <text> [flags]",
  options: [
    { flag: "--query <text>", description: "Search query text", required: true },
    { flag: "--count <n>", description: "Number of search results (default: 10)", type: "number" },
    { flag: "--list-tools", description: "List available MCP tools and exit" },
  ],
  examples: [
    'bl search web --query "阿里云百炼最新功能"',
    'bl search web --query "TypeScript 5.9 new features" --count 5',
    'bl search web --query "今日新闻"',
    "bl search web --list-tools",
  ],
  async run(config, flags) {
    const mcpUrl = mcpWebSearchEndpoint(config.baseUrl);
    const format = detectOutputFormat(config.output);

    // --- List tools mode ---
    if (flags.listTools) {
      if (config.dryRun) {
        emitResult({ endpoint: mcpUrl, action: "tools/list" }, format);
        return;
      }

      const client = new McpClient(config, mcpUrl);
      await client.initialize();
      const tools = await client.listTools();

      emitResult({ tools }, format);
      return;
    }

    // --- Search mode ---
    let query = flags.query;
    if (!query) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "Enter your search query:" });
        if (!hint) {
          process.stderr.write("Search cancelled.\n");
          process.exit(1);
        }
        query = hint;
      } else {
        failIfMissing("query", "bl search web --query <text>");
      }
    }

    if (config.dryRun) {
      emitResult(
        {
          endpoint: mcpUrl,
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
    const client = new McpClient(config, mcpUrl);
    const spinner = createSpinner("Initializing search...");

    if (!config.quiet) spinner.start();

    try {
      await client.initialize();

      if (!config.quiet) spinner.update("Searching...");

      // Build tool arguments
      const toolArgs: Record<string, unknown> = { query: query! };
      if (flags.count) toolArgs.count = flags.count;

      // Call the search tool
      const result = await client.callTool("bailian_web_search", toolArgs);

      if (!config.quiet) spinner.stop("Done.");

      // Handle error response
      if (result.isError) {
        const errText = result.content.map((c) => c.text || "").join("\n");
        process.stderr.write(`Search error: ${errText}\n`);
        process.exit(1);
      }

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
      throw error;
    }
  },
});
