/**
 * 沙箱产物生命周期清理（计划式，支持 dry-run 预览）。
 *
 * 两类产物、两种策略：
 * - runs/<run-id>/：正常路径在调用结束时立即销毁（见 app-layer 的 finally），
 *   留到这里的都是崩溃路径孤儿（SIGKILL/断电致 finally 未执行），按 TTL 回收。
 * - runtimes/rl/<runtime-id>/：不可变运行时按版本跨调用复用；基线升级后旧版本
 *   目录成为死重，按「只保留当前基线」回收。
 * 下载缓存（cache/rl，按 SHA 内容寻址、跨版本复用）与 override 开发目录绝不触碰。
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { managedRuntimesRoot, runsRoot } from "./paths.ts";

/** runs 孤儿默认年龄阈值：24 小时（正常调用分钟级结束，阈值极宽裕）。 */
export const DEFAULT_RUNS_TTL_MS = 24 * 60 * 60 * 1000;

export interface ICleanupOptions {
  /** 基准时间（ms epoch），默认 Date.now()。 */
  now?: number;
  /** runs 孤儿年龄阈值（毫秒），默认 24h。 */
  runsTtlMs?: number;
  /** 回收 runs 孤儿，默认 true。 */
  pruneRuns?: boolean;
  /** 回收旧版本运行时，默认 false（prepare 顺手清理只动 runs）。 */
  pruneRuntimes?: boolean;
  /** 当前基线 runtime-id；pruneRuntimes 时缺省则跳过运行时回收（fail-safe）。 */
  currentRuntimeId?: string;
  /** 只产出计划，不删除。 */
  dryRun?: boolean;
  /** 目录覆盖（测试用）；缺省取隔离布局的标准路径。 */
  runsDir?: string;
  runtimesDir?: string;
}

/** 单个产物的处置决定（keep 也列出，保证预览透明）。 */
export interface ICleanupEntry {
  path: string;
  kind: "run" | "runtime";
  action: "remove" | "keep";
  reason: string;
}

export interface ICleanupResult {
  dryRun: boolean;
  entries: ICleanupEntry[];
  /** 实际删除数（dryRun 时为计划删除数）。 */
  removedCount: number;
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => join(dir, dirent.name));
}

/**
 * 清理沙箱产物：先对每个目录产出 remove/keep 计划，再统一执行删除。
 * 单目录删除失败降级为 keep（不抛错、不中断其余清理）；stat 竞态直接跳过。
 */
export function cleanupSandboxArtifacts(options: ICleanupOptions = {}): ICleanupResult {
  const now = options.now ?? Date.now();
  const ttlMs = options.runsTtlMs ?? DEFAULT_RUNS_TTL_MS;
  const dryRun = options.dryRun === true;
  const entries: ICleanupEntry[] = [];

  if (options.pruneRuns !== false) {
    for (const path of listSubdirs(options.runsDir ?? runsRoot())) {
      let mtimeMs: number;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {
        continue; // 与并发清理竞态：目录已消失
      }
      const expired = now - mtimeMs > ttlMs;
      entries.push({
        path,
        kind: "run",
        action: expired ? "remove" : "keep",
        reason: expired ? "orphaned run older than TTL" : "within TTL",
      });
    }
  }

  if (options.pruneRuntimes === true && options.currentRuntimeId !== undefined) {
    const runtimesDir = options.runtimesDir ?? managedRuntimesRoot();
    const currentPath = join(runtimesDir, options.currentRuntimeId);
    for (const path of listSubdirs(runtimesDir)) {
      const isCurrent = path === currentPath;
      entries.push({
        path,
        kind: "runtime",
        action: isCurrent ? "keep" : "remove",
        reason: isCurrent ? "current baseline runtime" : "superseded runtime version",
      });
    }
  }

  let removedCount = 0;
  for (const entry of entries) {
    if (entry.action !== "remove") continue;
    if (dryRun) {
      removedCount += 1;
      continue;
    }
    try {
      rmSync(entry.path, { recursive: true, force: true });
      removedCount += 1;
    } catch (error) {
      entry.action = "keep";
      entry.reason = `delete failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return { dryRun, entries, removedCount };
}
