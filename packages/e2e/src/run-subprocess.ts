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
  /** Default true. Set false only when the case must inherit the host `~/.bailian`. */
  isolate?: boolean;
  /** Opt-in: copy host console access_token into isolated config. */
  seedCredentials?: boolean;
}

export function resolveTsxBin(): string {
  const root = monorepoRoot();
  const name = process.platform === "win32" ? "tsx.cmd" : "tsx";
  return join(root, "node_modules", ".bin", name);
}

/** Run main.ts via Node's tsx loader (no tsx CLI IPC server). */
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
