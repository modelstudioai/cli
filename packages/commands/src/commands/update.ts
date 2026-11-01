import { execSync, spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  BailianError,
  DEFAULT_INSTALL_PS1_URL,
  DEFAULT_INSTALL_SCRIPT_URL,
  defineCommand,
  ExitCode,
  getConfigDir,
  getUpdateInstallMethod,
  type InstallMethod,
  type CommandOutput,
} from "bailian-cli-core";
import {
  fetchLatestVersion,
  fetchBinaryChannelVersion,
  isValidUpdateTargetVersion,
  normalizeBinaryVersion,
  performBinaryUpdate,
} from "bailian-cli-runtime";

const SKILL_UPDATE_CMD = "bl skill update";

/** Own nested output so installer and skill subprocesses cannot corrupt stdout. */
function runUpdateCommand(command: string, output: CommandOutput, jsonDiagnostics = false): Buffer {
  const child = spawnSync(command, { shell: true, stdio: ["inherit", "pipe", "pipe"] });
  const stderr = child.stderr?.toString() ?? "";
  let childFailure: Record<string, unknown> | undefined;
  for (const line of stderr.split("\n").filter(Boolean)) {
    if (jsonDiagnostics) {
      let record: Record<string, unknown> | undefined;
      try {
        const parsed: unknown = JSON.parse(line);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          record = parsed as Record<string, unknown>;
      } catch {
        /* Older installed CLIs may emit text. */
      }
      if (record?.warning) {
        output.warning(record.warning as Parameters<CommandOutput["warning"]>[0]);
        continue;
      }
      if (record?.debug) {
        output.debug(record.debug as Parameters<CommandOutput["debug"]>[0]);
        continue;
      }
      if (record?.error) {
        if (typeof record.error === "object") {
          const failure = record.error as Record<string, unknown>;
          childFailure = Object.fromEntries(
            ["code", "message", "request_id"]
              .filter((key) => typeof failure[key] === "string" || typeof failure[key] === "number")
              .map((key) => [key, failure[key]]),
          );
        }
        output.debug({
          message: { "en-US": "Nested skill update failed.", "zh-CN": "嵌套 Skill 更新失败。" },
          code: "SKILL_UPDATE_ERROR",
          details: childFailure,
        });
        continue;
      }
    }
    if (/^npm warn\b/i.test(line)) output.warning({ message: line, code: "NPM_WARNING" });
    else output.info(line);
  }
  if (child.error || child.status !== 0) {
    throw Object.assign(
      child.error ??
        new Error(`Command failed: ${command}${stderr ? `\n${stderr.trimEnd()}` : ""}`),
      {
        stdout: child.stdout,
        stderr: child.stderr,
        status: child.status,
        signal: child.signal,
        diagnostic: childFailure,
      },
    );
  }
  return child.stdout ?? Buffer.alloc(0);
}

function skillUpdateResult(value: unknown): unknown {
  if (typeof value !== "string" && !Buffer.isBuffer(value)) return undefined;
  try {
    return JSON.parse(value.toString());
  } catch {
    return undefined;
  }
}

function updateAgentSkill(output: CommandOutput): {
  status: "updated" | "skipped";
  result?: unknown;
  exit_code?: number | null;
} {
  output.progress({ "en-US": "Updating agent skill...", "zh-CN": "正在更新 Agent Skill..." });
  try {
    // Capture the nested command's result so this invocation owns stdout.
    const childOutput = runUpdateCommand(`${SKILL_UPDATE_CMD} --output json`, output, true);
    output.info({ "en-US": "✓ Agent skill updated.", "zh-CN": "✓ Agent Skill 已更新。" });
    return { status: "updated", result: skillUpdateResult(childOutput) };
  } catch (error) {
    const failure =
      error && typeof error === "object"
        ? (error as {
            status?: number | null;
            signal?: unknown;
            diagnostic?: unknown;
            stdout?: unknown;
          })
        : undefined;
    output.warning({
      message: {
        "en-US": `Agent skill update skipped. Run manually: ${SKILL_UPDATE_CMD}`,
        "zh-CN": `已跳过 Agent Skill 更新。请手动运行：${SKILL_UPDATE_CMD}`,
      },
      code: "SKILL_UPDATE_SKIPPED",
      details: { exit_code: failure?.status, signal: failure?.signal, error: failure?.diagnostic },
    });
    const childOutput =
      error && typeof error === "object" && "stdout" in error ? error.stdout : undefined;
    return {
      status: "skipped",
      exit_code: failure?.status,
      result: skillUpdateResult(childOutput),
    };
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
    const method = getUpdateInstallMethod(identity);
    const requestedTo = ctx.flags.to?.trim();
    const pinnedVersion = requestedTo ? normalizeBinaryVersion(requestedTo) : undefined;
    const info = (english: string, chinese: string) =>
      ctx.output.info({ "en-US": english, "zh-CN": chinese });
    info(`Current version: ${currentVersion}`, `当前版本：${currentVersion}`);
    info(`Install method: ${method}`, `安装方式：${method}`);
    if (pinnedVersion) info(`Target version: ${pinnedVersion}`, `目标版本：${pinnedVersion}`);
    else ctx.output.progress({ "en-US": "Checking for updates...", "zh-CN": "正在检查更新..." });

    if (method === "brew" || method === "winget") {
      const command =
        method === "brew" ? "brew upgrade bailian-cli" : "winget upgrade Aliyun.BailianCLI";
      const lines = [
        ctx.localize({
          "en-US": `This CLI was installed via ${method}. Update with:`,
          "zh-CN": `此 CLI 通过 ${method} 安装。请使用以下命令更新：`,
        }),
        `  ${command}`,
      ];
      if (pinnedVersion)
        lines.push(
          ctx.localize({
            "en-US": `Note: --to is not supported for ${method} installs.`,
            "zh-CN": `注意：${method} 安装不支持 --to。`,
          }),
        );
      ctx.output.result(
        {
          status: "manual",
          current_version: currentVersion,
          install_method: method,
          upgrade_command: command,
          ...(pinnedVersion ? { target_version: pinnedVersion } : {}),
        },
        { text: lines.join("\n") },
      );
      return;
    }

    const targetVersion = pinnedVersion ?? (await resolveLatest(method, npmPackage));
    if (!targetVersion)
      throw new BailianError(
        ctx.localize({
          "en-US": "Could not determine the latest version.",
          "zh-CN": "无法确定最新版本。",
        }),
        ExitCode.GENERAL,
        ctx.localize({
          "en-US": "Check network access, or pass --to <version>.",
          "zh-CN": "请检查网络连接，或传入 --to <version>。",
        }),
      );
    if (targetVersion === currentVersion) {
      const message = ctx.localize(
        pinnedVersion
          ? {
              "en-US": `✓ Already at ${currentVersion}.`,
              "zh-CN": `✓ 当前已是 ${currentVersion}。`,
            }
          : {
              "en-US": `✓ Already up to date (${currentVersion}).`,
              "zh-CN": `✓ 当前已是最新版本（${currentVersion}）。`,
            },
      );
      const skillUpdate = method === "npm" ? updateAgentSkill(ctx.output) : undefined;
      ctx.output.result(
        {
          status: "up-to-date",
          current_version: currentVersion,
          target_version: targetVersion,
          install_method: method,
          ...(skillUpdate ? { skill_update: skillUpdate } : {}),
        },
        { text: message },
      );
      return;
    }

    if (!pinnedVersion) info(`Latest version: ${targetVersion}`, `最新版本：${targetVersion}`);
    let installedVersion: string | undefined;
    if (method === "binary") {
      ctx.output.progress({
        "en-US": "Updating via binary channel...",
        "zh-CN": "正在通过二进制渠道更新...",
      });
      try {
        installedVersion = await performBinaryUpdate(targetVersion);
        writeUpdateState(installedVersion);
      } catch (error) {
        const reinstall =
          error instanceof BailianError && error.hint
            ? error.hint.replace(/^Re-run:\s*/i, "")
            : binaryReinstallHint().trim();
        throw new BailianError(
          ctx.localize({
            "en-US": "Automatic binary update failed.",
            "zh-CN": "自动二进制更新失败。",
          }),
          ExitCode.GENERAL,
          ctx.localize({
            "en-US": `Re-run the install script:\n  ${reinstall}`,
            "zh-CN": `请重新运行安装脚本：\n  ${reinstall}`,
          }),
          { cause: error },
        );
      }
    } else {
      const npmSpec = pinnedVersion ? `${npmPackage}@${pinnedVersion}` : `${npmPackage}@latest`;
      const command = `npm install -g ${npmSpec}`;
      ctx.output.progress({
        "en-US": `Updating ${npmPackage} via npm...`,
        "zh-CN": `正在通过 npm 更新 ${npmPackage}...`,
      });
      try {
        const childOutput = runUpdateCommand(command, ctx.output);
        if (childOutput?.length) ctx.output.info(childOutput.toString().trimEnd());
        try {
          const rawVersion = execSync(`${binName} --version 2>/dev/null`, {
            encoding: "utf-8",
          }).trim();
          installedVersion = rawVersion.replace(new RegExp(`^${binName}\\s+`), "");
          writeUpdateState(installedVersion);
        } catch {
          /* Version lookup has always been best effort. */
        }
      } catch (error) {
        throw new BailianError(
          ctx.localize({ "en-US": "Automatic update failed.", "zh-CN": "自动更新失败。" }),
          ExitCode.GENERAL,
          ctx.localize({
            "en-US": `Please run manually:\n  ${command}`,
            "zh-CN": `请手动运行：\n  ${command}`,
          }),
          { cause: error },
        );
      }
    }
    const skillUpdate = updateAgentSkill(ctx.output);
    ctx.output.result(
      {
        status: "updated",
        current_version: currentVersion,
        target_version: targetVersion,
        ...(installedVersion ? { version: installedVersion } : {}),
        install_method: method,
        skill_update: skillUpdate,
      },
      {
        text: ctx.localize(
          installedVersion
            ? {
                "en-US": `✓ Update complete: ${currentVersion} → ${installedVersion}`,
                "zh-CN": `✓ 更新完成：${currentVersion} → ${installedVersion}`,
              }
            : { "en-US": "✓ Update complete.", "zh-CN": "✓ 更新完成。" },
        ),
      },
    );
  },
});
