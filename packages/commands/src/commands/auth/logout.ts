import {
  defineCommand,
  clearApiKey,
  readConfigFile,
  writeConfigFile,
  getConfigPath,
} from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";

async function clearConsoleToken(): Promise<boolean> {
  const file = readConfigFile() as Record<string, unknown>;
  if (!file.access_token) return false;
  delete file.access_token;
  await writeConfigFile(file);
  return true;
}

export default defineCommand({
  description: "Clear stored credentials",
  auth: "none",
  usageArgs: "[--console] [--yes] [--dry-run]",
  flags: {
    console: {
      type: "switch",
      description: "Only clear the console access_token, keep api_key intact",
    },
    yes: { type: "switch", description: "Skip confirmation prompt" },
  },
  exampleArgs: ["", "--console", "--dry-run", "--yes"],
  async run(ctx) {
    const { config, flags } = ctx;
    const file = readConfigFile();

    if (flags.console) {
      const hasToken = !!file.access_token;
      if (config.dryRun) {
        if (hasToken) emitBare("Would clear access_token from ~/.bailian/config.json");
        else emitBare("No console access_token to clear.");
        emitBare("No changes made.");
        return;
      }
      if (hasToken) {
        await clearConsoleToken();
        process.stderr.write(`Cleared access_token from ${getConfigPath()}\n`);
        if (file.api_key) {
          process.stderr.write(
            "api_key is still configured and will be used for authentication.\n",
          );
        }
      } else {
        process.stderr.write("No console access_token to clear.\n");
      }
      return;
    }

    const hasKey = !!(file.api_key || file.access_token);

    if (config.dryRun) {
      if (hasKey) emitBare("Would clear api_key / access_token from ~/.bailian/config.json");
      else emitBare("No credentials to clear.");
      emitBare("No changes made.");
      return;
    }

    if (hasKey) {
      await clearApiKey();
      process.stderr.write("Cleared api_key / access_token from ~/.bailian/config.json\n");
    } else {
      process.stderr.write("No credentials to clear.\n");
    }
  },
});
