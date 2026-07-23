import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  defineCommand,
  getConfigDir,
  getInstallMethod,
  type InstallMethod,
} from "bailian-cli-core";
import {
  ansi,
  fetchLatestVersion,
  fetchBinaryChannelVersion,
  performBinaryUpdate,
  type AnsiStyles,
} from "bailian-cli-runtime";

const SKILL_SOURCE = "modelstudioai/cli";
const SKILL_INSTALL_CMD = `npx skills add ${SKILL_SOURCE} --all -g -y`;

function updateAgentSkill(color: AnsiStyles): void {
  process.stderr.write("\nUpdating agent skill...\n");
  try {
    execSync(SKILL_INSTALL_CMD, { stdio: "inherit" });
    process.stderr.write(`${color.green("\u2713 Agent skill updated.")}\n`);
  } catch {
    process.stderr.write(
      `${color.yellow(`Agent skill update skipped. Run manually: ${SKILL_INSTALL_CMD}`)}\n`,
    );
  }
}

function writeUpdateState(version: string): void {
  try {
    const stateFile = join(getConfigDir(), "update-state.json");
    writeFileSync(stateFile, JSON.stringify({ lastChecked: Date.now(), latestVersion: version }));
  } catch {
    /* ignore */
  }
}

async function resolveLatest(method: InstallMethod, npmPackage: string): Promise<string | null> {
  if (method === "binary") {
    return (
      (await fetchBinaryChannelVersion("latest", 5000)) ??
      (await fetchLatestVersion(5000, npmPackage))
    );
  }
  return fetchLatestVersion(5000, npmPackage);
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
    const method = getInstallMethod();

    process.stderr.write(`Current version: ${color.yellow(currentVersion)}\n`);
    process.stderr.write(`Install method: ${color.dim(method)}\n`);
    process.stderr.write("Checking for updates...\n");

    if (method === "brew" || method === "winget") {
      const cmd =
        method === "brew" ? "brew upgrade bailian-cli" : "winget upgrade Aliyun.BailianCLI";
      process.stderr.write(
        `${color.yellow(`This CLI was installed via ${method}. Update with:`)}\n  ${cmd}\n`,
      );
      return;
    }

    const latest = await resolveLatest(method, npmPackage);

    if (latest && latest === currentVersion) {
      process.stderr.write(`${color.green(`\u2713 Already up to date (${currentVersion}).`)}\n`);
      if (method === "npm") updateAgentSkill(color);
      return;
    }

    if (latest) {
      process.stderr.write(`Latest version: ${color.green(latest)}\n\n`);
    } else {
      process.stderr.write(`${color.yellow("Could not determine the latest version.")}\n`);
      return;
    }

    if (method === "binary") {
      process.stderr.write(`Updating via binary channel...\n\n`);
      try {
        const newVer = await performBinaryUpdate(latest);
        process.stderr.write(
          `\n${color.green(`\u2713 Update complete: ${currentVersion} \u2192 ${newVer}`)}\n`,
        );
        writeUpdateState(newVer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`\nAutomatic binary update failed: ${message}\n`);
        process.stderr.write("Re-run the install script:\n");
        process.stderr.write(
          "  curl -fsSL https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli/install.sh | bash\n\n",
        );
      }
      return;
    }

    const cmd = `npm install -g ${npmPackage}@latest`;
    process.stderr.write(`Updating ${npmPackage} via npm...\n\n`);

    try {
      execSync(cmd, { stdio: "inherit" });
      try {
        const rawVer = execSync(`${binName} --version 2>/dev/null`, { encoding: "utf-8" }).trim();
        const newVer = rawVer.replace(new RegExp(`^${binName}\\s+`), "");
        process.stderr.write(
          `\n${color.green(`\u2713 Update complete: ${currentVersion} \u2192 ${newVer}`)}\n`,
        );
        writeUpdateState(newVer);
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
