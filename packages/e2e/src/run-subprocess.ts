import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";
import { monorepoRoot } from "./monorepo-root.ts";

const execFileAsync = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** monorepo 根目录下的 tsx 可执行文件 */
export function resolveTsxBin(): string {
  const root = monorepoRoot();
  const name = process.platform === "win32" ? "tsx.cmd" : "tsx";
  return join(root, "node_modules", ".bin", name);
}

/** 子进程通过 Node 的 tsx loader 执行指定 main.ts 入口，不启动 tsx CLI 的 IPC server。 */
export async function runNodeMain(
  mainTs: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv } = { cwd: process.cwd() },
): Promise<RunCliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", tsxLoader, mainTs, ...args],
      {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          DO_NOT_TRACK: "1",
          ...options.env,
        },
      },
    );
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
