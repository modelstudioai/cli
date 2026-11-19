/**
 * 托管运行时管理器（黑盒内部初始化）。
 *
 * 安装生命周期：独占锁 → 按清单多源下载 CPython（python-build-standalone install_only，
 * canonical → 镜像回退，单次带超时）→ 逐源校验 SHA256 → 系统 tar 解压到版本目录 → ensurepip → 按随包 universal 锁文件
 * pip install --require-hashes 装 dashscope 及传递依赖 → 受控环境版本/import 自检
 * → 原子写 READY+指针。首次下载、缓存 READY 后长期复用；后续 run 用解释器绝对路径
 * （不 source activate、不改全局 PATH）。开发态 override：BAILIAN_RL_RUNTIME 指向
 * 本机已装 dashscope 的 Python 目录时跳过发行校验直接复用。
 *
 * 清单默认取随包受审查产物（bundledRuntimeManifest），固定版本求稳、不耦合发版。
 */

import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { httpTransport } from "../client/transport.ts";
import { runtimeCacheRoot, runtimeRoot as runtimeRootDir } from "../isolation/paths.ts";
import { RL_DEPENDENCY_LOCK } from "./locks.ts";
import {
  RL_DASHSCOPE_VERSION,
  RL_PIP_INDEX_ENV,
  RL_PYTHON_VERSION,
  assertArtifactIntegrity,
  bundledRuntimeManifest,
  parseRuntimeManifest,
  pythonDownloadCandidates,
  selectManifestEntry,
  type IRuntimeManifest,
  type IRuntimeManifestEntry,
} from "./manifest.ts";

/** 开发态 override 环境变量：指向本机已装 dashscope（受审查基线版本）的 Python 目录。 */
export const RUNTIME_OVERRIDE_ENV = "BAILIAN_RL_RUNTIME";

/** 单次下载超时（毫秒）：停滞快速失败转镜像回退，避免无限挂起。 */
const RL_DOWNLOAD_TIMEOUT_MS = 120_000;

/** 解析好的运行时（run 用解释器绝对路径）。 */
export interface IResolvedRuntime {
  runtimeRoot: string;
  pythonPath: string;
  dashscopeVersion: string;
  source: "override" | "managed";
}

/** 受控命令执行结果（tar / python / pip 自检）。 */
export interface IRuntimeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** 安装生命周期依赖注入 seam（默认走真实 fetch/spawn，便于单测 mock）。 */
export interface IRuntimeDeps {
  download(url: string): Promise<Buffer>;
  run(command: string, args: string[], options?: { cwd?: string }): Promise<IRuntimeCommandResult>;
}

export interface IResolveRuntimeOptions {
  /** 直接传入清单（优先于 manifestPath 与随包清单）。 */
  manifest?: IRuntimeManifest;
  /** 清单文件路径（覆盖随包清单，供审查/联调）。 */
  manifestPath?: string;
  /** 是否允许首次准备运行时（非交互缺省 false）。 */
  allowInstall?: boolean;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  arch?: string;
  deps?: IRuntimeDeps;
}

const defaultDeps: IRuntimeDeps = {
  async download(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RL_DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await httpTransport.fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new BailianError(
          `Failed to download runtime artifact (HTTP ${response.status}).`,
          ExitCode.NETWORK,
        );
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof BailianError) throw error;
      throw new BailianError(
        `Failed to download runtime artifact from ${url}.`,
        ExitCode.NETWORK,
        "Check network connectivity, or set BAILIAN_RL_PYTHON_MIRROR to a reachable mirror, then retry runtime prepare.",
      );
    } finally {
      clearTimeout(timer);
    }
  },
  run(command, args, options) {
    return new Promise<IRuntimeCommandResult>((resolve, reject) => {
      const child = spawn(command, args, { cwd: options?.cwd, shell: false, windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
      child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      child.on("error", reject);
      child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
    });
  },
};

/** 解压后 CPython 解释器绝对路径（install_only tarball 顶层为 python/）。 */
export function managedPythonPath(root: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return join(root, "python", "python.exe");
  const minor = RL_PYTHON_VERSION.split(".").slice(0, 2).join(".");
  return join(root, "python", "bin", `python${minor}`);
}

/** 运行时版本目录名：平台-架构-Python 版本-基线 SDK 版本（不可变寻址键）。 */
function runtimeIdFor(entry: IRuntimeManifestEntry, manifest: IRuntimeManifest): string {
  return `${entry.os}-${entry.arch}-${entry.pythonVersion}-${manifest.dashscopeVersion}`;
}

/** 当前基线的托管 runtime-id（随包受审查清单）；本平台无条目时返回 undefined。 */
export function currentManagedRuntimeId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const manifest = bundledRuntimeManifest();
  const entry = selectManifestEntry(manifest, platform, arch);
  if (!entry) return undefined;
  return runtimeIdFor(entry, manifest);
}

/** override 目录下的解释器候选（取首个存在者）。 */
function overridePythonPath(dir: string, platform: NodeJS.Platform): string | undefined {
  const candidates =
    platform === "win32"
      ? [join(dir, "python.exe"), join(dir, "Scripts", "python.exe")]
      : [join(dir, "bin", "python"), join(dir, "python")];
  return candidates.find((candidate) => existsSync(candidate));
}

function runtimeUnavailable(detail: string): BailianError {
  return new BailianError(
    `RUNTIME_UNAVAILABLE: ${detail}`,
    ExitCode.GENERAL,
    `Prepare the managed runtime first (runtime prepare), or set BAILIAN_RL_RUNTIME to a local dashscope ${RL_DASHSCOPE_VERSION} Python directory for development. No cloud resources were created.`,
  );
}

function loadManifest(manifestPath?: string): IRuntimeManifest | undefined {
  if (!manifestPath || !existsSync(manifestPath)) return undefined;
  return parseRuntimeManifest(readFileSync(manifestPath, "utf8"));
}

/** 解析运行时：dev override 优先，其次托管 READY，必要时首次下载安装。 */
export async function resolveRuntime(
  options: IResolveRuntimeOptions = {},
): Promise<IResolvedRuntime> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;

  const override = env[RUNTIME_OVERRIDE_ENV];
  if (override) {
    const pythonPath = overridePythonPath(override, platform);
    if (!pythonPath) {
      throw new BailianError(
        `BAILIAN_RL_RUNTIME is set but no Python interpreter was found under "${override}".`,
        ExitCode.GENERAL,
        `Point BAILIAN_RL_RUNTIME at a directory containing a dashscope ${RL_DASHSCOPE_VERSION} Python interpreter.`,
      );
    }
    // 实测 override 环境的 dashscope 版本（不谎报基线常量）：FC_PYPI_LIB 由该版本
    // 派生，提交端与 FC 安装版本锁步；未安装/不可 import 则 fail-closed。
    const deps = options.deps ?? defaultDeps;
    let measured = "";
    try {
      const probe = await deps.run(pythonPath, [
        "-I",
        "-c",
        'import importlib.metadata; print(importlib.metadata.version("dashscope"))',
      ]);
      if (probe.exitCode === 0) measured = probe.stdout.trim();
    } catch {
      // 解释器不可执行等情形统一走下方 fail-closed
    }
    if (!measured) {
      throw new BailianError(
        `BAILIAN_RL_RUNTIME points at "${override}" but dashscope is not importable there.`,
        ExitCode.GENERAL,
        `Install dashscope==${RL_DASHSCOPE_VERSION} (the reviewed baseline) into that Python environment, then retry.`,
      );
    }
    return {
      runtimeRoot: override,
      pythonPath,
      dashscopeVersion: measured,
      source: "override",
    };
  }

  const manifest =
    options.manifest ?? loadManifest(options.manifestPath) ?? bundledRuntimeManifest();
  const entry = selectManifestEntry(manifest, platform, arch);
  if (!entry) {
    throw runtimeUnavailable(`no validated runtime for ${platform}/${arch}.`);
  }

  const runtimeId = runtimeIdFor(entry, manifest);
  const root = runtimeRootDir(runtimeId);
  const pythonPath = managedPythonPath(root, platform);
  if (existsSync(join(root, "READY")) && existsSync(pythonPath)) {
    return {
      runtimeRoot: root,
      pythonPath,
      dashscopeVersion: manifest.dashscopeVersion,
      source: "managed",
    };
  }
  if (!options.allowInstall) {
    throw runtimeUnavailable("the managed runtime is not prepared yet.");
  }
  await installRuntime(entry, manifest, root, options.deps ?? defaultDeps, platform, env);
  return {
    runtimeRoot: root,
    pythonPath,
    dashscopeVersion: manifest.dashscopeVersion,
    source: "managed",
  };
}

/** 取得运行时目录独占锁（O_EXCL 原子创建）；返回释放函数。 */
function acquireRuntimeLock(root: string): () => void {
  mkdirSync(root, { recursive: true });
  const lockPath = join(root, ".lock");
  let fd: number;
  try {
    fd = openSync(lockPath, "wx");
  } catch {
    throw new BailianError(
      "Another runtime prepare is in progress for this runtime.",
      ExitCode.GENERAL,
      "Wait for it to finish, or remove the stale .lock if no prepare is running.",
    );
  }
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  return () => {
    try {
      unlinkSync(lockPath);
    } catch {
      // 清理失败不影响结果
    }
  };
}

/** 逐源下载并校验 SHA256；任一源网络失败或哈希不符转下一源，全部失败抛最后一个错误。 */
async function downloadVerifiedArtifact(
  candidates: string[],
  expectedSha256: string,
  deps: IRuntimeDeps,
): Promise<Buffer> {
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const data = await deps.download(url);
      assertArtifactIntegrity(data, expectedSha256);
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new BailianError(
    "Failed to download CPython from all candidate sources.",
    ExitCode.NETWORK,
  );
}

/** 完整安装生命周期；中断不生成 READY，下次在新目录重建。 */
export async function installRuntime(
  entry: IRuntimeManifestEntry,
  manifest: IRuntimeManifest,
  root: string,
  deps: IRuntimeDeps,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const releaseLock = acquireRuntimeLock(root);
  try {
    // 1. 多源下载 CPython 并校验完整性（canonical → 镜像回退；换源不换 SHA）。
    const cacheDir = runtimeCacheRoot();
    mkdirSync(cacheDir, { recursive: true });
    const candidates = pythonDownloadCandidates(entry.pythonUrl, env);
    const tarball = await downloadVerifiedArtifact(candidates, entry.pythonSha256, deps);
    const tarPath = join(cacheDir, `${entry.pythonSha256}.tar.gz`);
    writeFileSync(tarPath, tarball);

    // 2. 系统 tar 解压到版本目录（install_only 顶层 python/，含解释器与 stdlib）。
    mkdirSync(root, { recursive: true });
    const extracted = await deps.run("tar", ["-xzf", tarPath, "-C", root]);
    if (extracted.exitCode !== 0) {
      throw new BailianError(
        `Failed to extract CPython ${entry.pythonVersion}: ${extracted.stderr}`,
        ExitCode.GENERAL,
      );
    }
    const pythonPath = managedPythonPath(root, platform);
    if (!existsSync(pythonPath)) {
      throw new BailianError(
        `CPython interpreter missing after extract: ${pythonPath}`,
        ExitCode.GENERAL,
        "Retry runtime prepare; the incomplete runtime was not marked READY.",
      );
    }

    // 3. 确保 pip 可用（install_only 通常自带；ensurepip 兜底，失败交由下一步暴露）。
    await deps.run(pythonPath, ["-m", "ensurepip", "--upgrade"]);

    // 4. 按随包 universal 锁文件安装锁定 wheel 依赖（绝不安装用户业务 requirements）。
    //    --require-hashes 强制每个包含哈希，dashscope wheel 命中受审查基线 SHA256。
    const lockfilePath = join(root, "requirements.lock");
    writeFileSync(lockfilePath, RL_DEPENDENCY_LOCK, "utf8");
    const pipArgs = ["-m", "pip", "install", "--require-hashes", "--no-warn-script-location"];
    // 受限地区可经 BAILIAN_RL_PIP_INDEX_URL 指向稳定 PyPI 镜像；--require-hashes 仍逐包校验哈希。
    const pipIndex = env[RL_PIP_INDEX_ENV];
    if (pipIndex) pipArgs.push("--index-url", pipIndex);
    pipArgs.push("-r", lockfilePath);
    const install = await deps.run(pythonPath, pipArgs);
    if (install.exitCode !== 0) {
      throw new BailianError(
        `pip failed to install locked dependencies: ${install.stderr}`,
        ExitCode.GENERAL,
      );
    }

    // 5. 受控环境版本/import 自检。
    const version = await deps.run(pythonPath, ["-I", "--version"]);
    const importCheck = await deps.run(pythonPath, ["-I", "-c", "import dashscope"]);
    if (version.exitCode !== 0 || importCheck.exitCode !== 0) {
      throw new BailianError(
        "Runtime self-check failed (python --version / import dashscope).",
        ExitCode.GENERAL,
        "Retry runtime prepare; the incomplete runtime was not marked READY.",
      );
    }

    // 6. 原子写 READY 标记 + 运行时指针（此后 run 才可见）。
    writeFileSync(
      join(root, "READY"),
      `${JSON.stringify({ dashscopeVersion: manifest.dashscopeVersion, pythonVersion: entry.pythonVersion }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(root, "runtime.json"),
      `${JSON.stringify({ pythonPath }, null, 2)}\n`,
      "utf8",
    );
  } finally {
    releaseLock();
  }
}
