import {
  BailianError,
  ExitCode,
  defineCommand,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { removePlugin } from "../../plugins/manager.ts";
import { resetCommandCatalogCache } from "../../load-commands.ts";
import { createRegistry, resetRegistry } from "../../registry.ts";

export default defineCommand({
  name: "plugin remove",
  description: "Remove an installed bailian-cli plugin",
  usage: "bl plugin remove <name>",
  examples: ["bl plugin remove bailian-plugin-agent"],
  async run(_config: Config, flags: GlobalFlags) {
    const positional = flags._positional as string[] | undefined;
    const name = positional?.[0];
    if (!name) {
      throw new BailianError("Missing plugin name.", ExitCode.USAGE, "bl plugin remove <name>");
    }

    await removePlugin(name);
    resetCommandCatalogCache();
    resetRegistry();
    await createRegistry();

    if (flags.output === "json") {
      process.stdout.write(JSON.stringify({ removed: name }, null, 2) + "\n");
      return;
    }
    process.stdout.write(`Removed plugin: ${name}\n`);
  },
});
