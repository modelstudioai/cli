/** Help text for the runtime built-in `mcp serve` path. */
export function printMcpServeHelp(binName: string): void {
  process.stderr.write(
    [
      "Start a local STDIO MCP server exposing all CLI commands as tools (for connectors such as QwenWork)",
      `Usage: ${binName} mcp serve`,
      "",
      "Notes:",
      "  Speaks MCP over stdin/stdout. Do not treat this process as a normal CLI that prints results to stdout.",
      `  Authenticate first with \`${binName} auth login\` (or env credentials); tools reuse the same local credential resolution as the CLI.`,
      `  Distinct from \`${binName} mcp list|tools|call\`, which call Bailian marketplace MCP servers.`,
      "  This path is a runtime built-in (not a commands-library leaf), so it can mount the full product command map.",
      "",
      "Examples:",
      `  ${binName} mcp serve`,
      "",
    ].join("\n"),
  );
}
