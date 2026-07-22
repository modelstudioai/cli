import { mkdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import { fileURLToPath } from "url";
import { E2E_RUN_SESSION_FILENAME } from "./global-setup.ts";
import { monorepoRoot } from "./monorepo-root.ts";
import type { RunCliResult } from "./run-subprocess.ts";

let e2eOutputSessionId: string | undefined;

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

/** 在 `test/output/<会话>/` 下创建用例子目录 */
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

/** 从 `import.meta.url` 生成 OUT 子目录标签 */
export function e2eLabelFromMetaUrl(metaUrl: string): string {
  return basename(fileURLToPath(metaUrl), ".ts").replace(/\.e2e\.test$/, "");
}

export function parseStdoutJson<T = unknown>(stdout: string): T {
  const t = stdout.trim();
  const jsonMatch = t.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON object found in stdout: ${t.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]) as T;
}

/** Console session 未登录/已过期时的优雅失败判定 */
export function isConsoleAuthFailure(result: RunCliResult): boolean {
  if (result.exitCode === 0) return false;
  return /not logged in|has expired|NotLogined|Run `bl auth login/i.test(result.stderr);
}
