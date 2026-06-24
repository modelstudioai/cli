import { mkdirSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

/**
 * Vitest `global-setup.ts` 写入 `test/output/` 下本文件名，供各 worker 进程读取同一会话 id。
 */
export const E2E_RUN_SESSION_FILENAME = ".e2e-run-session";

/** 单次 `vp test` / Vitest 运行共用的 E2E 输出会话目录名（惰性缓存于当前进程）。 */
let e2eOutputSessionId: string | undefined;

/** `packages/commands` 根目录 */
export const commandsPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Monorepo 根（含根 `package.json`） */
export function monorepoRoot(): string {
  return join(commandsPackageRoot, "..", "..");
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

/** 从 `import.meta.url` 生成 OUT 子目录标签，避免并行用例目录冲突 */
export function e2eLabelFromMetaUrl(metaUrl: string): string {
  return basename(fileURLToPath(metaUrl), ".ts").replace(/\.e2e\.test$/, "");
}

export function parseStdoutJson<T = unknown>(stdout: string): T {
  const t = stdout.trim();
  return JSON.parse(t) as T;
}
