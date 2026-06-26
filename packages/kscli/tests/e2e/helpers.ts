import { execFile } from "child_process";
import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { promisify } from "util";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "util";

const execFileAsync = promisify(execFile);

/** `packages/kscli` 根目录（含 `src/main.ts`） */
export const kscliPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const mainTs = join(kscliPackageRoot, "src", "main.ts");

/** Monorepo 根（含根 `package.json` 和 `.env`） */
export function monorepoRoot(): string {
  return join(kscliPackageRoot, "..", "..");
}

// ---- E2E gating helpers ----

// ---- .env loader (cached) ----

let _rootEnvCache: Record<string, string | undefined> | null = null;

/** 读取 monorepo 根目录 `.env` 并缓存（.env 值优先于 shell 环境变量） */
function getRootEnv(): Record<string, string | undefined> {
  if (_rootEnvCache !== null) return _rootEnvCache;
  const rootEnvPath = join(monorepoRoot(), ".env");
  _rootEnvCache = existsSync(rootEnvPath) ? parseEnv(readFileSync(rootEnvPath, "utf8")) : {};
  return _rootEnvCache;
}

/** 从 .env 或 process.env 获取值（.env 优先） */
function envVar(key: string): string | undefined {
  return getRootEnv()[key] ?? process.env[key];
}

// ---- E2E gating helpers ----

/** 显式开启后才跑真实网络 E2E */
export function isBailianE2EEnabled(): boolean {
  return envVar("BAILIAN_E2E") === "1";
}

/** 是否有 DashScope API Key 可用 */
export function isDashScopeE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  return !!envVar("DASHSCOPE_API_KEY")?.trim();
}

/** 知识检索 E2E 就绪：E2E 开启 + API Key + search agent ID + workspace ID */
export function isSearchE2EReady(): boolean {
  if (!isDashScopeE2EReady()) return false;
  return (
    !!envVar("BAILIAN_E2E_SEARCH_AGENT_ID")?.trim() && !!envVar("BAILIAN_WORKSPACE_ID")?.trim()
  );
}

/** 知识问答 E2E 就绪：E2E 开启 + API Key + chat agent ID + workspace ID */
export function isChatE2EReady(): boolean {
  if (!isDashScopeE2EReady()) return false;
  return !!envVar("BAILIAN_E2E_CHAT_AGENT_ID")?.trim() && !!envVar("BAILIAN_WORKSPACE_ID")?.trim();
}

// ---- CLI runner ----

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 子进程执行 kscli（等价于 `node packages/kscli/src/main.ts ...`）。
 */
export async function runKscli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [mainTs, ...args], {
      cwd: kscliPackageRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        // .env values override shell env vars (ensures correct API key is used)
        ...getRootEnv(),
        // Unique clean config dir per run — prevents stale config.json from previous tests
        BAILIAN_CONFIG_DIR: mkdtempSync(join(tmpdir(), "kscli-test-")),
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

export function parseStdoutJson<T = unknown>(stdout: string): T {
  const t = stdout.trim();
  return JSON.parse(t) as T;
}

// ---- Global setup: load root .env ----

/**
 * Vitest globalSetup：加载 monorepo 根目录 `.env` 合并到 `process.env`。
 */
export function loadRootEnv(): void {
  const rootEnv = join(monorepoRoot(), ".env");
  if (existsSync(rootEnv)) {
    const parsed = parseEnv(readFileSync(rootEnv, "utf8"));
    Object.assign(process.env, parsed);
  }
}
