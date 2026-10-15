import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";
import { buildIsolatedCliEnv } from "./isolation.ts";
import { monorepoRoot } from "./monorepo-root.ts";

const execFileAsync = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunNodeMainOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /**
   * 默认 true：子进程使用隔离 HOME/config（强制 en-US、关闭系统 Agent 探测）。
   * 仅当用例必须完整继承宿主 `~/.bailian` 时设为 false。
   */
  isolate?: boolean;
  /**
   * 为 true 时把本机 config 里的 console access_token 写入隔离配置。
   * 默认 false。DashScope / OpenAPI 继续使用环境变量。
   */
  seedCredentials?: boolean;
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
  options: RunNodeMainOptions = { cwd: process.cwd() },
): Promise<RunCliResult> {
  const isolate = options.isolate !== false;
  const isolated = isolate
    ? buildIsolatedCliEnv({
        overrides: options.env,
        seedCredentials: options.seedCredentials,
      })
    : undefined;
  const env = isolated?.env ?? { ...process.env, ...options.env };
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", tsxLoader, mainTs, ...args],
      {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...env,
          NODE_NO_WARNINGS: "1",
          DO_NOT_TRACK: "1",
        },
      },
    );
    return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 };
  } catch (caught: unknown) {
    const error = caught as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: typeof error.code === "number" ? error.code : 1,
    };
  } finally {
    isolated?.dispose();
  }
}
