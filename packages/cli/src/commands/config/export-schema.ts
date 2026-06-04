import { defineCommand, generateToolSchema, type Command } from "bailian-cli-core";
import type { Config } from "bailian-cli-core";
import type { GlobalFlags } from "bailian-cli-core";
import { BailianError } from "bailian-cli-core";
import { ExitCode } from "bailian-cli-core";
import { loadCommandCatalog } from "../../load-commands.ts";

/**
 * Commands that are infrastructure/auth-related and not suitable as Agent tools.
 */
const SKIP_PREFIXES = ["auth ", "config ", "update", "plugin "];

export default defineCommand({
  name: "config export-schema",
  description:
    "Export all (or one) CLI command(s) as Anthropic/OpenAI-compatible JSON tool schemas",
  usage: 'bl config export-schema [--command "<name>"]',
  options: [
    {
      flag: "--command <name>",
      description: 'Export schema for a specific command only (e.g. "image generate")',
    },
  ],
  examples: ["bl config export-schema", 'bl config export-schema --command "video generate"'],
  async run(config: Config, flags: GlobalFlags) {
    const { commands } = await loadCommandCatalog();
    const targetCommand = flags.command as string | undefined;

    if (targetCommand) {
      const command = commands[targetCommand];
      if (!command) {
        throw new BailianError(`Command "${targetCommand}" not found.`, ExitCode.USAGE);
      }
      const schema = generateToolSchema(command);
      process.stdout.write(JSON.stringify(schema, null, 2) + "\n");
      return;
    }

    const allCommands = Object.values(commands) as Command[];
    const schemas = allCommands
      .filter((c) => !SKIP_PREFIXES.some((p) => c.name.startsWith(p)))
      .map((c) => generateToolSchema(c));

    process.stdout.write(JSON.stringify(schemas, null, 2) + "\n");
  },
});
