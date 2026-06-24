import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** 子进程 CLI 目标：各产品注入自己的入口与 cwd。 */
export interface CliTarget {
  entry: string;
  cwd: string;
  binName: string;
}

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 工厂：绑定 CLI 入口后返回 `runCli`。
 * request_id 等诊断信息在 stderr；`--output json` 时 JSON 在 stdout。
 */
export function createCliRunner(target: CliTarget): {
  runCli: (args: string[], envOverrides?: NodeJS.ProcessEnv) => Promise<RunCliResult>;
  binName: string;
} {
  const { entry, cwd, binName } = target;

  async function runCli(
    args: string[],
    envOverrides: NodeJS.ProcessEnv = {},
  ): Promise<RunCliResult> {
    try {
      const { stdout, stderr } = await execFileAsync("node", [entry, ...args], {
        cwd,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          DO_NOT_TRACK: "1",
          ...envOverrides,
        },
      });
      return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
    } catch (err: unknown) {
      const e = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
        exitCode: typeof e.code === "number" ? e.code : 1,
      };
    }
  }

  return { runCli, binName };
}
