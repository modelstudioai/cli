import { execFile } from "child_process";
import { mkdirSync, readFileSync } from "fs";
import { promisify } from "util";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readConfigFile } from "bailian-cli-core";

const execFileAsync = promisify(execFile);

/**
 * Vitest `global-setup.ts` 写入 `test/output/` 下本文件名，供各 worker 进程读取同一会话 id。
 * （仅模块内变量无法跨 Vitest 多进程 worker 共享。）
 */
export const E2E_RUN_SESSION_FILENAME = ".e2e-run-session";

/**
 * 单次 `vp test` / Vitest 运行共用的 E2E 输出会话目录名（惰性缓存于当前进程）。
 */
let e2eOutputSessionId: string | undefined;

/** `packages/cli` 根目录（含 `src/main.ts`） */
export const cliPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const mainTs = join(cliPackageRoot, "src", "main.ts");

/** Monorepo 根（含根 `package.json`） */
export function monorepoRoot(): string {
  return join(cliPackageRoot, "..", "..");
}

function readE2eRunSessionFromOutputDir(): string | undefined {
  try {
    const p = join(monorepoRoot(), "test", "output", E2E_RUN_SESSION_FILENAME);
    const t = readFileSync(p, "utf8").trim();
    return t.length > 0 ? t : undefined;
  } catch {
    return undefined;
  }
}

function getE2eOutputSessionId(): string {
  if (!e2eOutputSessionId) {
    const fromEnv = process.env.BAILIAN_E2E_RUN_ID?.trim();
    if (fromEnv) {
      e2eOutputSessionId = fromEnv.replace(/[^a-zA-Z0-9._-]+/g, "-");
    } else {
      const fromFile = readE2eRunSessionFromOutputDir();
      if (fromFile) {
        e2eOutputSessionId = fromFile.replace(/[^a-zA-Z0-9._-]+/g, "-");
      } else {
        e2eOutputSessionId = `e2e-run-${Date.now()}-${process.pid}`;
      }
    }
  }
  return e2eOutputSessionId;
}

/**
 * 在 `test/output/<会话>/` 下创建用例子目录。
 * 会话 id 优先 `BAILIAN_E2E_RUN_ID`，否则读 Vitest globalSetup 写入的 `test/output/.e2e-run-session`，
 * 再否则回退为单进程 id（非 Vitest 直接跑用例时）。
 * 若已设 `BAILIAN_E2E_OUT` 则直接使用（不再套会话目录）。
 */
export function makeE2eOutputDir(label: string): string {
  const fromEnv = process.env.BAILIAN_E2E_OUT?.trim();
  if (fromEnv) {
    mkdirSync(fromEnv, { recursive: true });
    return fromEnv;
  }
  const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const sessionDir = join(monorepoRoot(), "test", "output", getE2eOutputSessionId());
  mkdirSync(sessionDir, { recursive: true });
  const dir = join(sessionDir, `e2e-vp-${safe}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 全局 `--timeout` 秒数（视频等长任务） */
export function cliTimeoutSeconds(): string {
  return process.env.BAILIAN_E2E_TIMEOUT_SEC?.trim() || "3600";
}

export function cliTimeoutPrefix(): string[] {
  return ["--timeout", cliTimeoutSeconds()];
}

/** 显式开启后才跑真实网络 E2E，避免默认 `vp test` 依赖密钥或打外网 */
export function isBailianE2EEnabled(): boolean {
  return process.env.BAILIAN_E2E === "1";
}

/** 可调 DashScope 的 API Key：环境变量优先，否则读 ~/.bailian/config.json */
export function isDashScopeE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (process.env.DASHSCOPE_API_KEY?.trim()) return true;
  try {
    const f = readConfigFile();
    return typeof f.api_key === "string" && f.api_key.length > 0;
  } catch {
    return false;
  }
}

/** 语音与图像（可设 `BAILIAN_E2E_MEDIA=0` 在仅跑文本/记忆/知识库时跳过） */
export function isBailianE2EMediaEnabled(): boolean {
  if (process.env.BAILIAN_E2E_MEDIA === "0") return false;
  return isBailianE2EEnabled();
}

/** 文生视频 / 图生视频 / 参考视频 / 视频编辑（耗时长，默认关闭） */
export function isBailianE2EVideoEnabled(): boolean {
  return isBailianE2EEnabled() && process.env.BAILIAN_E2E_VIDEO === "1";
}

/** 从 `import.meta.url` 生成 OUT 子目录标签，避免并行用例目录冲突 */
export function e2eLabelFromMetaUrl(metaUrl: string): string {
  return basename(fileURLToPath(metaUrl), ".ts").replace(/\.e2e\.test$/, "");
}

/** 知识库用例：须显式索引 ID + API-KEY */
export function isKnowledgeE2EReady(): boolean {
  if (!isBailianE2EEnabled()) return false;
  if (!process.env.BAILIAN_E2E_INDEX_ID) return false;
  return isDashScopeE2EReady();
}

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 子进程执行 CLI（等价于在 `packages/cli` 下 `node src/main.ts ...`）。
 * request_id 等诊断信息在 stderr；`--output json` 时 JSON 在 stdout。
 */
export async function runCli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<RunCliResult> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [mainTs, ...args], {
      cwd: cliPackageRoot,
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

export function parseStdoutJson<T = unknown>(stdout: string): T {
  const t = stdout.trim();
  return JSON.parse(t) as T;
}
