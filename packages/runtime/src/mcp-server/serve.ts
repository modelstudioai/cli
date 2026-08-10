import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { AnyCommand, CommandPackManager, Identity } from "bailian-cli-core";
import { buildToolDescriptors, flagsToZodObject } from "./schema.ts";
import { invokeCommandForMcp } from "./invoke.ts";

export interface ServeMcpStdioOptions {
  identity: Identity;
  /** Leaf command entries from the product command map / registry. */
  leaves: Array<{ path: string; command: AnyCommand }>;
  commandPacks: CommandPackManager;
}

/**
 * Start an MCP server on stdin/stdout that exposes every leaf CLI command as a tool.
 * Resolves when the transport closes (client disconnect / EOF).
 */
export async function serveMcpStdio(options: ServeMcpStdioOptions): Promise<void> {
  const tools = buildToolDescriptors(options.leaves);

  const mcpServer = new McpServer({
    name: `${options.identity.clientName}-mcp`,
    version: options.identity.version,
  });

  for (const tool of tools) {
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: flagsToZodObject(tool.command.flags),
      },
      async (args) => {
        const result = await invokeCommandForMcp({
          identity: options.identity,
          path: tool.path.split(" "),
          command: tool.command,
          args: (args ?? {}) as Record<string, unknown>,
          commandPacks: options.commandPacks,
        });

        return {
          isError: !result.ok,
          content: [{ type: "text" as const, text: result.text }],
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  process.stderr.write(
    `${options.identity.binName} mcp serve: STDIO MCP ready (${tools.length} tools)\n`,
  );
}
