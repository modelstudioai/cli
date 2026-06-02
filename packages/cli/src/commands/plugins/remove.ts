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
  name: "plugins remove",
  description: "Remove an installed bailian-cli plugin",
  usage: "bl plugins remove <name>",
  examples: ["bl plugins remove @alife/bailian-agent"],
  async run(_config: Config, flags: GlobalFlags) {
    const positional = flags._positional as string[] | undefined;
    const name = positional?.[0];
    if (!name) {
      throw new BailianError("Missing plugin name.", ExitCode.USAGE, "bl plugins remove <name>");
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
