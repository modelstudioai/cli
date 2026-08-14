import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  BailianError,
  DEFAULT_INSTALL_PS1_URL,
  DEFAULT_INSTALL_SCRIPT_URL,
  defineCommand,
  getConfigDir,
  getUpdateInstallMethod,
  type InstallMethod,
} from "bailian-cli-core";
import {
  ansi,
  fetchLatestVersion,
  fetchBinaryChannelVersion,
  isValidUpdateTargetVersion,
  normalizeBinaryVersion,
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

function binaryReinstallHint(): string {
  if (process.platform === "win32") {
    return `  irm ${DEFAULT_INSTALL_PS1_URL} | iex\n`;
  }
  return `  curl -fsSL ${DEFAULT_INSTALL_SCRIPT_URL} | bash\n`;
}

export default defineCommand({
  description: {
    "en-US": "Update the CLI to the latest or a specified version",
    "zh-CN": "将 CLI 更新到最新版本或指定版本",
  },
  auth: "none",
  usageArgs: "[--to <version>]",
  flags: {
    to: {
      type: "string",
      valueHint: "<version>",
      description: {
        "en-US": "Install this exact version instead of the latest",
        "zh-CN": "安装指定版本，而不是最新版本",
      },
    },
  },
  exampleArgs: ["", "--to 0.1.14"],
  validate(flags) {
    if (flags.to === undefined) return undefined;
    if (!flags.to.trim()) return "--to requires a non-empty version";
    if (!isValidUpdateTargetVersion(flags.to)) {
      return `--to must be a semver version (e.g. 1.13.0, v1.13.0, 0.0.0-beta-<sha>-<YYYYMMDDHHMM>), got: ${flags.to.trim()}`;
    }
    return undefined;
  },
  async run(ctx) {
    const { identity } = ctx;
    const npmPackage = identity.npmPackage;
    const binName = identity.binName;
    const currentVersion = identity.version;
    const color = ansi(process.stderr);
    const method = getUpdateInstallMethod(identity);
    const requestedTo = ctx.flags.to?.trim();
    const pinnedVersion = requestedTo ? normalizeBinaryVersion(requestedTo) : undefined;

    process.stderr.write(`Current version: ${color.yellow(currentVersion)}\n`);
    process.stderr.write(`Install method: ${color.dim(method)}\n`);
    if (pinnedVersion) {
      process.stderr.write(`Target version: ${color.green(pinnedVersion)}\n`);
    } else {
      process.stderr.write("Checking for updates...\n");
    }

    if (method === "brew" || method === "winget") {
      const cmd =
        method === "brew" ? "brew upgrade bailian-cli" : "winget upgrade Aliyun.BailianCLI";
      process.stderr.write(
        `${color.yellow(`This CLI was installed via ${method}. Update with:`)}\n  ${cmd}\n`,
      );
      if (pinnedVersion) {
        process.stderr.write(
          `${color.dim(`Note: --to is not supported for ${method} installs.`)}\n`,
        );
      }
      return;
    }

    const targetVersion = pinnedVersion ?? (await resolveLatest(method, npmPackage));

    if (!targetVersion) {
      process.stderr.write(`${color.yellow("Could not determine the latest version.")}\n`);
      return;
    }

    if (targetVersion === currentVersion) {
      const message = pinnedVersion
        ? `\u2713 Already at ${currentVersion}.`
        : `\u2713 Already up to date (${currentVersion}).`;
      process.stderr.write(`${color.green(message)}\n`);
      if (method === "npm") updateAgentSkill(color);
      return;
    }

    if (!pinnedVersion) {
      process.stderr.write(`Latest version: ${color.green(targetVersion)}\n\n`);
    } else {
      process.stderr.write("\n");
    }

    if (method === "binary") {
      process.stderr.write(`Updating via binary channel...\n\n`);
      try {
        const newVer = await performBinaryUpdate(targetVersion);
        process.stderr.write(
          `\n${color.green(`\u2713 Update complete: ${currentVersion} \u2192 ${newVer}`)}\n`,
        );
        writeUpdateState(newVer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reinstall =
          error instanceof BailianError && error.hint
            ? error.hint.replace(/^Re-run:\s*/i, "")
            : binaryReinstallHint().trim();
        process.stderr.write(`\nAutomatic binary update failed: ${message}\n`);
        process.stderr.write("Re-run the install script:\n");
        process.stderr.write(`  ${reinstall}\n\n`);
      }
      return;
    }

    const npmSpec = pinnedVersion ? `${npmPackage}@${pinnedVersion}` : `${npmPackage}@latest`;
    const cmd = `npm install -g ${npmSpec}`;
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
