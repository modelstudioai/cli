import {
  BailianError,
  ExitCode,
  defineCommand,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { installPlugin } from "../../plugins/manager.ts";
import { resetCommandCatalogCache } from "../../load-commands.ts";
import { createRegistry, resetRegistry } from "../../registry.ts";

export default defineCommand({
  name: "plugin install",
  description: "Install a bailian-cli plugin package into ~/.bailian/plugins",
  usage: "bl plugin install <package>",
  options: [],
  examples: [
    "bl plugin install @ali/bailian-plugin-agent",
    "bl plugin install bailian-plugin-agent",
  ],
  async run(_config: Config, flags: GlobalFlags) {
    const positional = flags._positional as string[] | undefined;
    const packageSpec = positional?.[0];
    if (!packageSpec) {
      throw new BailianError(
        "Missing plugin package name.",
        ExitCode.USAGE,
        "bl plugin install <package>",
      );
    }

    const name = await installPlugin(packageSpec);
    resetCommandCatalogCache();
    resetRegistry();
    await createRegistry();

    if (flags.output === "json") {
      process.stdout.write(JSON.stringify({ installed: name }, null, 2) + "\n");
      return;
    }
    process.stdout.write(`Installed plugin: ${name}\n`);
  },
});
