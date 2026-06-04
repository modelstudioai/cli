import {
  BailianError,
  ExitCode,
  defineCommand,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { linkPlugin } from "../../plugins/manager.ts";
import { resetCommandCatalogCache } from "../../load-commands.ts";
import { createRegistry, resetRegistry } from "../../registry.ts";

export default defineCommand({
  name: "plugin link",
  description: "Link a local bailian-cli plugin directory",
  usage: "bl plugin link <path>",
  examples: ["bl plugin link ../bailian-plugin-agent"],
  async run(_config: Config, flags: GlobalFlags) {
    const positional = flags._positional as string[] | undefined;
    const pluginPath = positional?.[0];
    if (!pluginPath) {
      throw new BailianError("Missing plugin path.", ExitCode.USAGE, "bl plugin link <path>");
    }

    await linkPlugin(pluginPath);
    resetCommandCatalogCache();
    resetRegistry();
    await createRegistry();

    if (flags.output === "json") {
      process.stdout.write(JSON.stringify({ linked: pluginPath }, null, 2) + "\n");
      return;
    }
    process.stdout.write(`Linked plugin at ${pluginPath}\n`);
  },
});
