import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** 子进程执行指定 main.ts 入口 */
export async function runNodeMain(
  mainTs: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv } = { cwd: process.cwd() },
): Promise<RunCliResult> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [mainTs, ...args], {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        DO_NOT_TRACK: "1",
        ...options.env,
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
