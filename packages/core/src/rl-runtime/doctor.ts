/**
 * Runtime and sandbox self-check.
 *
 * Required checks (security baseline): credential-isolation mechanism probe, managed Python boot, SDK import, home
 * redirect in effect, closed-loop negative test (reading real credentials inside the sandbox must fail), proxy denies unrelated domains. Enhanced checks
 * (kernel network enforcement / process tree / memory / host network reachability) degrade with a notice when unavailable and never fail the report. When the runtime is missing,
 * related checks are marked skip (not treated as passed) and overall ok=false.
 */

import { connect as netConnect } from "node:net";
import { probeTcpHost } from "../client/network-diagnostics.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { executeIsolatedRun } from "../isolation/app-layer.ts";
import { createTaskDir } from "../isolation/paths.ts";
import { startWhitelistProxy } from "../isolation/proxy.ts";
import { createIsolationAdapter } from "../isolation/os-isolation/detect.ts";
import type { IIsolationAdapter } from "../isolation/types.ts";
import type { IResolvedRuntime } from "./manager.ts";

/** Single check result. */
export interface IDoctorCheck {
  name: string;
  /** Required fail/skip fails the report; enhanced degradation does not block. */
  required: boolean;
  status: "pass" | "fail" | "degraded" | "skip";
  detail?: string;
}

export interface IDoctorReport {
  checks: IDoctorCheck[];
  /** True only when every required check passes. */
  ok: boolean;
}

export interface IDoctorOptions {
  /** Resolved runtime; when missing, runtime-related checks are skipped. */
  runtime?: IResolvedRuntime;
  /** Real credential paths (targets of the closed-loop negative test), e.g. the real ~/.dashscope. */
  credentialDenyPaths?: string[];
  adapter?: IIsolationAdapter;
  platform?: NodeJS.Platform;
  /** Per-self-check timeout (ms). */
  timeoutMs?: number;
  /** Whether to probe host outbound network reachability (enhanced; off by default so doctor stays usable offline). */
  checkHostNetwork?: boolean;
  /** Host network probe targets (defaults to the API / CPython download / PyPI host trio). */
  hostNetworkTargets?: { host: string; port: number }[];
  /** Probe injection seam (unit tests inject results, no real outbound); returns an errno, or undefined for success. */
  hostNetworkProbe?: (host: string, port: number) => Promise<string | undefined>;
}

const SELF_CHECK_TIMEOUT_MS = 30_000;
const SELF_CHECK_MAX_OUTPUT = 1024 * 1024;

/** Default host network preflight targets: the submit / download / pip outbound dependencies. */
const HOST_NETWORK_TARGETS = [
  { host: "dashscope.aliyuncs.com", port: 443 },
  { host: "github.com", port: 443 },
  { host: "pypi.org", port: 443 },
];
const HOST_NETWORK_TIMEOUT_MS = 5_000;

/** CONNECT to the target through the proxy; returns whether it was denied with 403 (real loopback assertion). */
async function proxyDenies(port: number, target: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const socket = netConnect({ host: "127.0.0.1", port }, () => {
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
    });
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\r\n\r\n")) {
        socket.destroy();
        resolve(buffer.includes("403"));
      }
    });
    socket.on("error", reject);
    socket.setTimeout(5_000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Run doctor and return the per-check report. */
export async function runRuntimeDoctor(options: IDoctorOptions = {}): Promise<IDoctorReport> {
  const platform = options.platform ?? process.platform;
  const adapter = options.adapter ?? createIsolationAdapter(platform);
  const timeoutMs = options.timeoutMs ?? SELF_CHECK_TIMEOUT_MS;
  const checks: IDoctorCheck[] = [];

  // 1. Credential-isolation mechanism probe (hard requirement). Probe with the adapter actually used for execution,
  // so the mechanism verdict matches later sandbox runs (including injected custom adapters).
  const capability = await adapter.detect();
  const mechanismAvailable = capability.credentialDenyRead.available;
  checks.push({
    name: "credential-isolation-mechanism",
    required: true,
    status: mechanismAvailable ? "pass" : "fail",
    detail: mechanismAvailable
      ? capability.credentialDenyRead.mechanism
      : capability.credentialDenyRead.reason,
  });

  // Enhanced checks: degrade with a notice when unavailable; never block.
  checks.push({
    name: "network-kernel-enforce",
    required: false,
    status: capability.hardening.networkEnforce ? "pass" : "degraded",
    detail: capability.hardening.networkEnforce
      ? undefined
      : "Falling back to the whitelist proxy.",
  });
  checks.push({
    name: "process-tree-limit",
    required: false,
    status: capability.hardening.processTree ? "pass" : "degraded",
  });
  checks.push({
    name: "memory-limit",
    required: false,
    status: capability.hardening.memoryLimit ? "pass" : "degraded",
    detail: capability.hardening.memoryLimit ? undefined : "Not enforced in this release.",
  });

  // 2. Proxy denies unrelated domains (hard requirement, real loopback assertion, no external network).
  const proxy = await startWhitelistProxy();
  try {
    const denied = await proxyDenies(proxy.port, "example.com:443");
    checks.push({
      name: "proxy-denies-unrelated-domain",
      required: true,
      status: denied ? "pass" : "fail",
      detail: denied ? undefined : "Whitelist proxy did not reject example.com.",
    });
  } finally {
    await proxy.close();
  }

  // 2.5 Host outbound network reachability (enhanced): when an agent host sandbox (e.g. Codex's default
  // workspace-write) disables network, prepare/submission fail mid-flight; surface a degraded signal
  // with guidance here without failing the report (doctor stays usable offline).
  if (options.checkHostNetwork) {
    const targets = options.hostNetworkTargets ?? HOST_NETWORK_TARGETS;
    const probe =
      options.hostNetworkProbe ??
      ((host: string, port: number) => probeTcpHost(host, port, HOST_NETWORK_TIMEOUT_MS));
    const results = await Promise.all(
      targets.map(async (target) => ({ target, code: await probe(target.host, target.port) })),
    );
    const blocked = results.filter((result) => result.code !== undefined);
    checks.push({
      name: "host-network-reachability",
      required: false,
      status: blocked.length === 0 ? "pass" : "degraded",
      detail:
        blocked.length === 0
          ? undefined
          : `${blocked
              .map((result) => `${result.target.host}:${result.target.port} (${result.code})`)
              .join(
                ", ",
              )}. Agent host sandboxes (e.g. Codex workspace-write) block outbound network by default: enable network access for the agent, or run runtime prepare / job submission in a regular terminal. HTTPS_PROXY is honored when set.`,
    });
  }

  // 3. Runtime-related checks: skip when the runtime is missing or the mechanism is unavailable (not treated as passed).
  const runtime = options.runtime;
  const canRunSandbox = mechanismAvailable && runtime !== undefined;
  const denyPaths = options.credentialDenyPaths ?? [];

  if (!canRunSandbox) {
    const reason =
      runtime === undefined ? "runtime not resolved" : "credential isolation unavailable";
    for (const name of [
      "python-version",
      "sdk-import",
      "fc-pypi-lib-injected",
      "home-redirect",
      "credential-deny-negative",
    ]) {
      checks.push({ name, required: true, status: "skip", detail: reason });
    }
    return finalize(checks);
  }

  // taskDir is consumed by a single executeIsolatedRun call (destroyed unconditionally in finally),
  // so every probe must create its own layout; sharing would make the next probe's prepare write
  // into an already-destroyed directory (e.g. darwin profile.sb) and hit ENOENT.
  const runPython = async (
    code: string,
    extraArgs: string[] = [],
    sdkEnv?: Record<string, string>,
  ) => {
    const layout = createTaskDir();
    const result = await executeIsolatedRun(
      {
        layout,
        runtimeRoot: runtime.runtimeRoot,
        command: [runtime.pythonPath, "-I", "-c", code, ...extraArgs],
        apiKey: "doctor-self-check",
        credentialDenyPaths: denyPaths,
        timeoutMs,
        maxOutputBytes: SELF_CHECK_MAX_OUTPUT,
        sdkEnv,
      },
      adapter,
    );
    return { result, layout };
  };

  try {
    const version = await runPython("import sys; print(sys.version.split()[0])");
    checks.push({
      name: "python-version",
      required: true,
      status: version.result.exitCode === 0 ? "pass" : "fail",
      detail:
        version.result.exitCode === 0 ? version.result.stdout.trim() : version.result.stderr.trim(),
    });

    // The 1.25.23 package root has no __version__ attribute; read the version via importlib.metadata,
    // while import dashscope itself still verifies importability.
    const sdkImport = await runPython(
      'import dashscope, importlib.metadata; print(importlib.metadata.version("dashscope"))',
    );
    checks.push({
      name: "sdk-import",
      required: true,
      status: sdkImport.result.exitCode === 0 ? "pass" : "fail",
      detail:
        sdkImport.result.exitCode === 0
          ? sdkImport.result.stdout.trim()
          : sdkImport.result.stderr.trim(),
    });

    // Real assertion of the FC_PYPI_LIB injection chain: inside the sandbox it must read the version locked
    // to the submit-side runtime (zero user involvement; no manual env registration).
    const expectedFcPypiLib = `dashscope==${runtime.dashscopeVersion}`;
    const fcEnv = await runPython("import os; print(os.environ.get('FC_PYPI_LIB', ''))", [], {
      FC_PYPI_LIB: expectedFcPypiLib,
    });
    const fcOk = fcEnv.result.exitCode === 0 && fcEnv.result.stdout.trim() === expectedFcPypiLib;
    checks.push({
      name: "fc-pypi-lib-injected",
      required: true,
      status: fcOk ? "pass" : "fail",
      detail: fcOk
        ? expectedFcPypiLib
        : `expected ${expectedFcPypiLib}, got ${fcEnv.result.stdout.trim() || fcEnv.result.stderr.trim()}`,
    });

    const home = await runPython("import os; print(os.path.expanduser('~'))");
    const homeOk = home.result.exitCode === 0 && home.result.stdout.trim() === home.layout.homeDir;
    checks.push({
      name: "home-redirect",
      required: true,
      status: homeOk ? "pass" : "fail",
      detail: homeOk
        ? home.layout.homeDir
        : `expected ${home.layout.homeDir}, got ${home.result.stdout.trim()}`,
    });

    // Closed-loop negative test: reading the real credential path inside the sandbox must fail (exit!=0 counts as pass).
    if (denyPaths.length === 0) {
      checks.push({
        name: "credential-deny-negative",
        required: true,
        status: "skip",
        detail: "no real credential path provided",
      });
    } else {
      const negative = await runPython(
        "import sys\ntry:\n    open(sys.argv[1]).close()\nexcept OSError:\n    sys.exit(3)\nsys.exit(0)\n",
        [denyPaths[0]],
      );
      checks.push({
        name: "credential-deny-negative",
        required: true,
        status: negative.result.exitCode !== 0 ? "pass" : "fail",
        detail:
          negative.result.exitCode !== 0
            ? "real credential path is blocked inside the sandbox"
            : "real credential path was readable inside the sandbox",
      });
    }
  } catch (error) {
    const message = error instanceof BailianError ? error.message : String(error);
    checks.push({
      name: "sandbox-self-check",
      required: true,
      status: "fail",
      detail: message,
    });
  }

  return finalize(checks);
}

function finalize(checks: IDoctorCheck[]): IDoctorReport {
  const ok = checks.every((check) => !check.required || check.status === "pass");
  return { checks, ok };
}

/** Throw when doctor fails overall (for the command layer to normalize the exit code). */
export function assertDoctorPassed(report: IDoctorReport): void {
  if (!report.ok) {
    const failed = report.checks
      .filter((check) => check.required && check.status !== "pass")
      .map((check) => `${check.name}: ${check.status}${check.detail ? ` (${check.detail})` : ""}`)
      .join("; ");
    throw new BailianError(
      `Runtime doctor failed: ${failed}`,
      ExitCode.GENERAL,
      "Fix the required checks above before running RL tasks. No cloud resources were created.",
    );
  }
}
