import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { defineCommand, getConfigDir } from "bailian-cli-core";
import { ansi, fetchLatestVersion, type AnsiStyles } from "bailian-cli-runtime";

const SKILL_SOURCE = "modelstudioai/cli";
const SKILL_INSTALL_CMD = `npx skills add ${SKILL_SOURCE} --all -g -y`;

/** Build the install command for the given npm package. */
function detectInstallCommand(npmPackage: string): { cmd: string; label: string } {
  return { cmd: `npm install -g ${npmPackage}@latest`, label: "npm" };
}

function updateAgentSkill(color: AnsiStyles): void {
  process.stderr.write("\nUpdating agent skill...\n");
  try {
    // Reinstall (not `skills update`) into ~/.agents/skills/ and sync to all agent apps.
    // `--all` on `skills add` means --skill '*' --agent '*' -y (Cursor, Claude Code, etc.).
    execSync(SKILL_INSTALL_CMD, { stdio: "inherit" });
    process.stderr.write(`${color.green("\u2713 Agent skill updated.")}\n`);
  } catch {
    process.stderr.write(
      `${color.yellow(`Agent skill update skipped. Run manually: ${SKILL_INSTALL_CMD}`)}\n`,
    );
  }
}

export default defineCommand({
  description: "Update the CLI to the latest version",
  auth: "none",
  exampleArgs: [""],
  async run(ctx) {
    const { identity } = ctx;
    const npmPackage = identity.npmPackage;
    const binName = identity.binName;
    const currentVersion = identity.version;
    const color = ansi(process.stderr);

    process.stderr.write(`Current version: ${color.yellow(currentVersion)}\n`);

    // Check latest version first
    process.stderr.write("Checking for updates...\n");
    const latest = await fetchLatestVersion(5000, npmPackage);

    if (latest && latest === currentVersion) {
      process.stderr.write(`${color.green(`\u2713 Already up to date (${currentVersion}).`)}\n`);
      updateAgentSkill(color);
      return;
    }

    if (latest) {
      process.stderr.write(`Latest version: ${color.green(latest)}\n\n`);
    }

    const { cmd, label } = detectInstallCommand(npmPackage);
    process.stderr.write(`Updating ${npmPackage} via ${label}...\n\n`);

    try {
      execSync(cmd, { stdio: "inherit" });
      // Verify the installed version after update
      try {
        const rawVer = execSync(`${binName} --version 2>/dev/null`, { encoding: "utf-8" }).trim();
        // `<bin> --version` outputs "<bin> X.Y.Z" — extract just the version number
        const newVer = rawVer.replace(new RegExp(`^${binName}\\s+`), "");
        process.stderr.write(
          `\n${color.green(`\u2713 Update complete: ${currentVersion} \u2192 ${newVer}`)}\n`,
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
        process.stderr.write(`\n${color.green("\u2713 Update complete.")}\n`);
      }
      updateAgentSkill(color);
    } catch {
      process.stderr.write("\nAutomatic update failed. Please run manually:\n");
      process.stderr.write(`  ${cmd}\n\n`);
    }
  },
});
