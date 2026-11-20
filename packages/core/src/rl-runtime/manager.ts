/**
 * Managed runtime manager (black-box internal initialization).
 *
 * Install lifecycle: exclusive lock → multi-source CPython download per manifest (python-build-standalone install_only,
 * canonical → mirror fallback, each attempt timed) → per-source SHA256 verification → system tar extract into the version dir → ensurepip →
 * pip install --require-hashes of dashscope and transitive deps from the bundled universal lockfile → version/import self-check in a controlled env
 * → atomic READY marker + pointer write. First download is cached and reused long-term via READY; later runs use the interpreter absolute path
 * (no source activate, no global PATH changes). Dev override: BAILIAN_RL_RUNTIME pointing at a local Python dir with dashscope installed
 * reuses it directly, skipping release verification.
 *
 * The manifest defaults to the bundled reviewed artifact (bundledRuntimeManifest): pinned versions for stability, decoupled from CLI releases.
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
import {
  isSandboxNetworkDenialCode,
  networkCauseCode,
  SANDBOX_NETWORK_HINT,
} from "../client/network-diagnostics.ts";
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

/** Dev override env var: points at a local Python dir with dashscope (the reviewed baseline version) installed. */
export const RUNTIME_OVERRIDE_ENV = "BAILIAN_RL_RUNTIME";

/** Per-download timeout (ms): fail fast on stalls and fall back to mirrors instead of hanging forever. */
const RL_DOWNLOAD_TIMEOUT_MS = 120_000;

/** Resolved runtime (runs use the interpreter absolute path). */
export interface IResolvedRuntime {
  runtimeRoot: string;
  pythonPath: string;
  dashscopeVersion: string;
  source: "override" | "managed";
}

/** Controlled command execution result (tar / python / pip self-checks). */
export interface IRuntimeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Dependency-injection seam for the install lifecycle (defaults to real fetch/spawn; mockable in unit tests). */
export interface IRuntimeDeps {
  download(url: string): Promise<Buffer>;
  run(command: string, args: string[], options?: { cwd?: string }): Promise<IRuntimeCommandResult>;
}

export interface IResolveRuntimeOptions {
  /** Manifest passed directly (takes precedence over manifestPath and the bundled manifest). */
  manifest?: IRuntimeManifest;
  /** Manifest file path (overrides the bundled manifest; for review / integration debugging). */
  manifestPath?: string;
  /** Whether first-time runtime preparation is allowed (defaults to false for non-interactive use). */
  allowInstall?: boolean;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  arch?: string;
  deps?: IRuntimeDeps;
}

/** Download failure wrapper: message carries the errno; sandbox-denial codes append network-enable/proxy guidance (mirrors cannot help). */
export function runtimeDownloadFailure(url: string, error: unknown): BailianError {
  const code = networkCauseCode(error);
  const sandboxHint = isSandboxNetworkDenialCode(code) ? ` ${SANDBOX_NETWORK_HINT}` : "";
  return new BailianError(
    `Failed to download runtime artifact from ${url}${code ? ` (${code})` : ""}.`,
    ExitCode.NETWORK,
    `Check network connectivity, or set BAILIAN_RL_PYTHON_MIRROR to a reachable mirror, then retry runtime prepare.${sandboxHint}`,
    { cause: error },
  );
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
      throw runtimeDownloadFailure(url, error);
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

/** Absolute path of the extracted CPython interpreter (install_only tarball top level is python/). */
export function managedPythonPath(root: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return join(root, "python", "python.exe");
  const minor = RL_PYTHON_VERSION.split(".").slice(0, 2).join(".");
  return join(root, "python", "bin", `python${minor}`);
}

/** Runtime version directory name: platform-arch-Python version-baseline SDK version (immutable addressing key). */
function runtimeIdFor(entry: IRuntimeManifestEntry, manifest: IRuntimeManifest): string {
  return `${entry.os}-${entry.arch}-${entry.pythonVersion}-${manifest.dashscopeVersion}`;
}

/** Managed runtime-id for the current baseline (bundled reviewed manifest); undefined when this platform has no entry. */
export function currentManagedRuntimeId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const manifest = bundledRuntimeManifest();
  const entry = selectManifestEntry(manifest, platform, arch);
  if (!entry) return undefined;
  return runtimeIdFor(entry, manifest);
}

/** Interpreter candidates under the override dir (first existing one wins). */
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

/** Resolve the runtime: dev override first, then managed READY, then first-time download + install if allowed. */
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
    // Measure the override env's dashscope version for real (never report the baseline constant blindly): FC_PYPI_LIB is
    // derived from it, keeping the submit side and the FC install in lockstep; fail closed if missing or not importable.
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
      // Non-executable interpreter and similar cases all fall through to the fail-closed path below
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

/** Acquire the exclusive runtime-dir lock (atomic O_EXCL creation); returns the release function. */
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
      // Cleanup failure does not affect the result
    }
  };
}

/** Download and verify SHA256 per source; network failure or hash mismatch moves to the next source; if all fail, throw the last error. */
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

/** Full install lifecycle; an interruption never writes READY, so the next attempt rebuilds in a fresh directory. */
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
    // 1. Multi-source CPython download with integrity verification (canonical → mirror fallback; switching sources never changes the SHA).
    const cacheDir = runtimeCacheRoot();
    mkdirSync(cacheDir, { recursive: true });
    const candidates = pythonDownloadCandidates(entry.pythonUrl, env);
    const tarball = await downloadVerifiedArtifact(candidates, entry.pythonSha256, deps);
    const tarPath = join(cacheDir, `${entry.pythonSha256}.tar.gz`);
    writeFileSync(tarPath, tarball);

    // 2. System tar extract into the version dir (install_only top level python/, containing the interpreter and stdlib).
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

    // 3. Ensure pip is available (install_only usually ships it; ensurepip as fallback, failures surface in the next step).
    await deps.run(pythonPath, ["-m", "ensurepip", "--upgrade"]);

    // 4. Install locked wheel deps from the bundled universal lockfile (never install user business requirements).
    //    --require-hashes forces a hash per package; the dashscope wheel must match the reviewed baseline SHA256.
    const lockfilePath = join(root, "requirements.lock");
    writeFileSync(lockfilePath, RL_DEPENDENCY_LOCK, "utf8");
    const pipArgs = ["-m", "pip", "install", "--require-hashes", "--no-warn-script-location"];
    // Restricted regions can point BAILIAN_RL_PIP_INDEX_URL at a stable PyPI mirror; --require-hashes still verifies every package.
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

    // 5. Version/import self-check in a controlled environment.
    const version = await deps.run(pythonPath, ["-I", "--version"]);
    const importCheck = await deps.run(pythonPath, ["-I", "-c", "import dashscope"]);
    if (version.exitCode !== 0 || importCheck.exitCode !== 0) {
      throw new BailianError(
        "Runtime self-check failed (python --version / import dashscope).",
        ExitCode.GENERAL,
        "Retry runtime prepare; the incomplete runtime was not marked READY.",
      );
    }

    // 6. Atomically write the READY marker + runtime pointer (only then visible to runs).
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
