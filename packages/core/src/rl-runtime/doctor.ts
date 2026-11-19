/**
 * 运行时与沙箱自检。
 *
 * 必过项（安全底线）：凭据隔离机制探测、托管 Python 可启动、SDK 可导入、home
 * 重定向生效、环境闭环负向测试（沙箱内读真实凭据失败）、代理拒无关域名。增强项
 * （网络内核强制/进程树/内存）不可用时降级提示，不判定整体失败。运行时缺失时
 * 相关项标 skip（不当通过），整体 ok=false。
 */

import { connect as netConnect } from "node:net";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { executeIsolatedRun } from "../isolation/app-layer.ts";
import { createTaskDir } from "../isolation/paths.ts";
import { startWhitelistProxy } from "../isolation/proxy.ts";
import { createIsolationAdapter } from "../isolation/os-isolation/detect.ts";
import type { IIsolationAdapter } from "../isolation/types.ts";
import type { IResolvedRuntime } from "./manager.ts";

/** 单项检查结果。 */
export interface IDoctorCheck {
  name: string;
  /** 必过项失败/skip 则整体不通过；增强项降级不阻断。 */
  required: boolean;
  status: "pass" | "fail" | "degraded" | "skip";
  detail?: string;
}

export interface IDoctorReport {
  checks: IDoctorCheck[];
  /** 所有必过项均 pass 才为 true。 */
  ok: boolean;
}

export interface IDoctorOptions {
  /** 已解析运行时；缺失则运行时相关项 skip。 */
  runtime?: IResolvedRuntime;
  /** 真实凭据路径（环境闭环负向测试目标），如真实 ~/.dashscope。 */
  credentialDenyPaths?: string[];
  adapter?: IIsolationAdapter;
  platform?: NodeJS.Platform;
  /** 单次自检超时（毫秒）。 */
  timeoutMs?: number;
}

const SELF_CHECK_TIMEOUT_MS = 30_000;
const SELF_CHECK_MAX_OUTPUT = 1024 * 1024;

/** 通过代理 CONNECT 目标，返回是否被 403 拒绝（回环真实断言）。 */
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

/** 运行 doctor，返回逐项报告。 */
export async function runRuntimeDoctor(options: IDoctorOptions = {}): Promise<IDoctorReport> {
  const platform = options.platform ?? process.platform;
  const adapter = options.adapter ?? createIsolationAdapter(platform);
  const timeoutMs = options.timeoutMs ?? SELF_CHECK_TIMEOUT_MS;
  const checks: IDoctorCheck[] = [];

  // 1. 凭据隔离机制探测（硬性）。用实际执行所用的 adapter 探测，
  // 保证机制判定与后续沙箱执行一致（含注入自定义 adapter 的场景）。
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

  // 增强项：不可用降级提示，不阻断。
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

  // 2. 代理拒无关域名（硬性，回环真实断言，不依赖外网）。
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

  // 3. 运行时相关项：缺失运行时或机制不可用则 skip（不当通过）。
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

  // taskDir 随 executeIsolatedRun 单次调用消费（finally 无条件销毁），
  // 每个探针必须各自创建 layout；共享会让下一个探针的 prepare 向已销毁
  // 目录写文件（如 darwin profile.sb）而 ENOENT。
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

    // 1.25.23 包根无 __version__ 属性；版本经 importlib.metadata 读取，
    // import dashscope 本身仍验证可导入性。
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

    // FC_PYPI_LIB 注入链真实断言：沙箱内必须读到与提交端运行时锁步的版本
    // （用户零感知，无需手动注册环境变量）。
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

    // 环境闭环负向测试：沙箱内读真实凭据路径必须失败（exit!=0 才算通过）。
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

/** doctor 整体失败时抛错（供命令层归一化退出码）。 */
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
