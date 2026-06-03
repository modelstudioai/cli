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
  name: "plugins install",
  description: "Install a bailian-cli plugin package into ~/.bailian/plugins",
  usage: "bl plugins install <package>",
  options: [],
  examples: [
    "bl plugins install @ali/bailian-plugin-agent",
    "bl plugins install bailian-plugin-agent",
  ],
  async run(_config: Config, flags: GlobalFlags) {
    const positional = flags._positional as string[] | undefined;
    const packageSpec = positional?.[0];
    if (!packageSpec) {
      throw new BailianError(
        "Missing plugin package name.",
        ExitCode.USAGE,
        "bl plugins install <package>",
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
