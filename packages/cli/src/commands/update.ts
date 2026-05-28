import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { defineCommand, getConfigDir } from "bailian-cli-core";
import { CLI_VERSION } from "../version.ts";
import { NPM_PACKAGE, fetchLatestVersion } from "../utils/update-checker.ts";

/** Build the install command */
function detectInstallCommand(): { cmd: string; label: string } {
  return { cmd: `npm install -g ${NPM_PACKAGE}@latest`, label: "npm" };
}

export default defineCommand({
  name: "update",
  description: "Update bl to the latest version",
  usage: "bl update",
  examples: ["bl update"],
  async run() {
    const isTTY = process.stderr.isTTY;
    const green = isTTY ? "\x1b[32m" : "";
    const yellow = isTTY ? "\x1b[33m" : "";
    const reset = isTTY ? "\x1b[0m" : "";

    process.stderr.write(`Current version: ${yellow}${CLI_VERSION}${reset}\n`);

    // Check latest version first
    process.stderr.write("Checking for updates...\n");
    const latest = await fetchLatestVersion(5000);

    if (latest && latest === CLI_VERSION) {
      process.stderr.write(`${green}\u2713 Already up to date (${CLI_VERSION}).${reset}\n`);
      return;
    }

    if (latest) {
      process.stderr.write(`Latest version: ${green}${latest}${reset}\n\n`);
    }

    const { cmd, label } = detectInstallCommand();
    process.stderr.write(`Updating ${NPM_PACKAGE} via ${label}...\n\n`);

    try {
      execSync(cmd, { stdio: "inherit" });
      // Verify the installed version after update
      try {
        const rawVer = execSync("bl --version 2>/dev/null", { encoding: "utf-8" }).trim();
        // bl --version outputs "bl X.Y.Z" — extract just the version number
        const newVer = rawVer.replace(/^bl\s+/, "");
        process.stderr.write(
          `\n${green}\u2713 Update complete: ${CLI_VERSION} \u2192 ${newVer}${reset}\n`,
        );
        // Update the cached state so the post-run notification doesn't fire
        try {
          const stateFile = join(getConfigDir(), "update-state.json");
          writeFileSync(
            stateFile,
            JSON.stringify({ lastChecked: Date.now(), latestVersion: newVer }),
          );
        } catch {
          /* ignore */
        }
      } catch {
        process.stderr.write(`\n${green}\u2713 Update complete.${reset}\n`);
      }
    } catch {
      process.stderr.write("\nAutomatic update failed. Please run manually:\n");
      process.stderr.write(`  ${cmd}\n\n`);
    }
  },
});
