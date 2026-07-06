import { defineCommand, getConfigPath } from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Clear stored credentials",
  auth: "none",
  usageArgs: "[--console] [--dry-run]",
  flags: {
    console: {
      type: "switch",
      description: "Only clear the console access_token, keep api_key intact",
    },
  },
  exampleArgs: ["", "--console", "--dry-run"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const store = ctx.authStore();
    const stored = store.stored();

    if (flags.console) {
      if (settings.dryRun) {
        if (stored.console) emitBare("Would clear access_token from ~/.bailian/config.json");
        else emitBare("No console access_token to clear.");
        emitBare("No changes made.");
        return;
      }
      if (await store.logout("console")) {
        process.stderr.write(`Cleared access_token from ${getConfigPath()}\n`);
        if (stored.apiKey) {
          process.stderr.write(
            "api_key is still configured and will be used for authentication.\n",
          );
        }
      } else {
        process.stderr.write("No console access_token to clear.\n");
      }
      return;
    }

    const hasKey = stored.apiKey || stored.console;

    if (settings.dryRun) {
      if (hasKey) emitBare("Would clear api_key / access_token from ~/.bailian/config.json");
      else emitBare("No credentials to clear.");
      emitBare("No changes made.");
      return;
    }

    if (await store.logout("all")) {
      process.stderr.write("Cleared api_key / access_token from ~/.bailian/config.json\n");
    } else {
      process.stderr.write("No credentials to clear.\n");
    }
  },
});
