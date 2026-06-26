import {
  defineCommand,
  detectOutputFormat,
  mcpWebSearchEndpoint,
  type Config,
  type GlobalFlags,
  McpClient,
} from "bailian-cli-core";
import { createSpinner } from "bailian-cli-runtime";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Search the web using DashScope MCP WebSearch service",
  auth: "apiKey",
  usageArgs: "--query <text> [flags]",
  options: [
    { flag: "--query <text>", description: "Search query text" },
    { flag: "--count <n>", description: "Number of search results (default: 10)", type: "number" },
    { flag: "--list-tools", description: "List available MCP tools and exit" },
  ],
  exampleArgs: [
    '--query "Alibaba Cloud Bailian latest features"',
    '--query "TypeScript 5.9 new features" --count 5',
    '--query "Today\'s news"',
    "--list-tools",
  ],
  validate: (f) => (!f.listTools && !f.query ? "Missing required flag: --query" : undefined),
  async run(config: Config, flags: GlobalFlags) {
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
    const query = flags.query as string;

    if (config.dryRun) {
      emitResult(
        {
          endpoint: mcpUrl,
          action: "tools/call",
          tool: "bailian_web_search",
          arguments: {
            query: query!,
            count: (flags.count as number) || undefined,
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
      if (flags.count) toolArgs.count = flags.count as number;

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
