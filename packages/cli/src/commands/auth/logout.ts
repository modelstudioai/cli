import {
  defineCommand,
  readConfigFile,
  writeConfigFile,
  getConfigPath,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "auth logout",
  description: "Clear stored credentials",
  usage: "bl auth logout [--console] [--all] [--yes] [--dry-run]",
  options: [
    {
      flag: "--console",
      description: "Only clear the console access_token, keep api_key intact",
      type: "boolean",
    },
    { flag: "--all", description: "Clear all stored auth credentials", type: "boolean" },
    { flag: "--yes", description: "Skip confirmation prompt" },
  ],
  examples: [
    "bl auth logout",
    "bl auth logout --console",
    "bl auth logout --all",
    "bl auth logout --dry-run",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const file = readConfigFile() as Record<string, unknown>;

    if (flags.console) {
      const hasToken = !!file.access_token;
      if (config.dryRun) {
        if (hasToken) emitBare("Would clear access_token from ~/.bailian/config.json");
        else emitBare("No console access_token to clear.");
        emitBare("No changes made.");
        return;
      }
      if (hasToken) {
        delete file.access_token;
        await writeConfigFile(file);
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

    const keys = keysToClear(config, !!flags.all);
    const hasKey = keys.some(
      (key) => typeof file[key] === "string" && (file[key] as string).length,
    );

    if (config.dryRun) {
      if (hasKey) emitBare(`Would clear ${keys.join(", ")} from ~/.bailian/config.json`);
      else emitBare("No credentials to clear.");
      emitBare("No changes made.");
      return;
    }

    if (hasKey) {
      for (const key of keys) delete file[key];
      if (config.activeAuthMode !== "standard-api-key") {
        file.active_auth_mode = "standard-api-key";
      }
      await writeConfigFile(file);
      process.stderr.write(`Cleared ${keys.join(", ")} from ${getConfigPath()}\n`);
      if (config.activeAuthMode !== "standard-api-key") {
        process.stderr.write("Active auth mode reset to standard-api-key.\n");
      }
    } else {
      process.stderr.write("No credentials to clear.\n");
    }
  },
});

function keysToClear(config: Config, all: boolean): string[] {
  if (all)
    return [
      "api_key",
      "coding_plan_api_key",
      "token_plan_api_key",
      "active_auth_mode",
      "access_token",
    ];
  if (config.activeAuthMode === "coding-plan") return ["coding_plan_api_key"];
  if (config.activeAuthMode === "token-plan") return ["token_plan_api_key"];
  return ["api_key", "access_token"];
}
