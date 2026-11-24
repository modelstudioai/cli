/**
 * 进程启动 / 超时 / 输出限额 / 进程树管理。
 *
 * 参数数组 + shell:false（绝不经过 shell）；POSIX 用 detached 进程组以便整组
 * kill；墙钟超时与输出超限均杀进程；支持 AbortSignal 中断（命令层接 SIGINT）。
 * OS 强制由 wrapCommand 钩子注入（darwin sandbox-exec / linux bwrap）。
 */

import { spawn } from "node:child_process";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

export interface IProcessOptions {
  /** 完整 argv，含解释器，如 [python, -I, -m, dashscope, ...]。 */
  command: string[];
  env: Record<string, string>;
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /** OS 包装：把原始 argv 转成沙箱 argv；缺省直接执行。 */
  wrapCommand?: (command: string[]) => string[];
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface IProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** 杀进程树：POSIX 杀进程组，Windows 用 taskkill /T /F 兜底。 */
function killProcessTree(pid: number | undefined, platform: NodeJS.Platform): void {
  if (pid === undefined) return;
  if (platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { shell: false, windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // 进程已退出
    }
  }
}

/** 启动受控子进程，收集 stdout/stderr，按超时/输出限额/中断杀进程。 */
export function runSandboxedProcess(options: IProcessOptions): Promise<IProcessResult> {
  const argv = options.wrapCommand ? options.wrapCommand(options.command) : options.command;
  const [executable, ...args] = argv;
  const platform = process.platform;

  return new Promise<IProcessResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: options.env,
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      detached: platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid, platform);
    }, options.timeoutMs);

    const onAbort = (): void => killProcessTree(child.pid, platform);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= options.maxOutputBytes) {
        const text = chunk.toString("utf8");
        stdout += text;
        options.onStdout?.(text);
      } else {
        killProcessTree(child.pid, platform);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= options.maxOutputBytes) {
        const text = chunk.toString("utf8");
        stderr += text;
        options.onStderr?.(text);
      } else {
        killProcessTree(child.pid, platform);
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new BailianError(
          `Failed to start sandboxed process: ${error.message}`,
          ExitCode.GENERAL,
          "Check the managed runtime via the runtime doctor command.",
          { cause: error },
        ),
      );
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ exitCode: code, signal, stdout, stderr, timedOut });
    });
  });
}
