import { defineCommand, type Config, type GlobalFlags } from "bailian-cli-core";
import { listPlugins } from "../../plugins/manager.ts";

export default defineCommand({
  name: "plugins list",
  description: "List installed and discovered bailian-cli plugins",
  usage: "bl plugins list",
  examples: ["bl plugins list"],
  async run(_config: Config, flags: GlobalFlags) {
    const { plugins, errors } = await listPlugins();
    const format = flags.output === "json" ? "json" : "text";

    if (format === "json") {
      process.stdout.write(JSON.stringify({ plugins, errors }, null, 2) + "\n");
      return;
    }

    if (plugins.length === 0) {
      process.stdout.write("No plugins installed.\n");
    } else {
      process.stdout.write("Plugins:\n");
      for (const p of plugins) {
        process.stdout.write(`  ${p.name} (${p.source})${p.version ? ` @ ${p.version}` : ""}\n`);
        process.stdout.write(`    ${p.root}\n`);
      }
    }

    if (errors.length > 0) {
      process.stderr.write("\nPlugin errors:\n");
      for (const e of errors) {
        process.stderr.write(`  ${e.plugin}: ${e.message}\n`);
      }
    }
  },
});
