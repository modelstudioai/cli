import { describe, expect, test } from "vite-plus/test";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupSandboxArtifacts, DEFAULT_RUNS_TTL_MS } from "../src/isolation/cleanup.ts";
import { managedRuntimesRoot, runsRoot } from "../src/isolation/paths.ts";
import { withIsolatedHome } from "./helpers/isolation.ts";

const HOUR_MS = 3_600_000;
const CURRENT_ID = "darwin-arm64-3.11.9-1.25.23";
const OLD_ID = "darwin-arm64-3.11.9-2.0.4";

/** 建目录并把 mtime 拨到 ageHours 小时前（先放内容再拨时间，避免被子项更新）。 */
function seedAgedDir(path: string, ageHours: number): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "marker.txt"), "x", "utf8");
  const when = new Date(Date.now() - ageHours * HOUR_MS);
  utimesSync(path, when, when);
}

describe("cleanupSandboxArtifacts", () => {
  test("dry-run plans removals without deleting anything", async () => {
    await withIsolatedHome(async () => {
      seedAgedDir(join(runsRoot(), "old-run"), 25);
      seedAgedDir(join(runsRoot(), "young-run"), 1);
      seedAgedDir(join(managedRuntimesRoot(), OLD_ID), 100);
      seedAgedDir(join(managedRuntimesRoot(), CURRENT_ID), 100);

      const result = cleanupSandboxArtifacts({
        dryRun: true,
        pruneRuntimes: true,
        currentRuntimeId: CURRENT_ID,
      });

      expect(result.dryRun).toBe(true);
      expect(result.removedCount).toBe(2);
      expect(result.entries).toHaveLength(4);
      expect(result.entries.filter((entry) => entry.action === "remove")).toHaveLength(2);
      // 计划式预览：零删除
      expect(existsSync(join(runsRoot(), "old-run"))).toBe(true);
      expect(existsSync(join(managedRuntimesRoot(), OLD_ID))).toBe(true);
    });
  });

  test("removes expired runs and superseded runtimes, keeps young and current", async () => {
    await withIsolatedHome(async () => {
      seedAgedDir(join(runsRoot(), "old-run"), 25);
      seedAgedDir(join(runsRoot(), "young-run"), 1);
      seedAgedDir(join(managedRuntimesRoot(), OLD_ID), 100);
      seedAgedDir(join(managedRuntimesRoot(), CURRENT_ID), 100);

      const result = cleanupSandboxArtifacts({
        pruneRuntimes: true,
        currentRuntimeId: CURRENT_ID,
      });

      expect(result.dryRun).toBe(false);
      expect(result.removedCount).toBe(2);
      expect(existsSync(join(runsRoot(), "old-run"))).toBe(false);
      expect(existsSync(join(managedRuntimesRoot(), OLD_ID))).toBe(false);
      expect(existsSync(join(runsRoot(), "young-run"))).toBe(true);
      expect(existsSync(join(managedRuntimesRoot(), CURRENT_ID))).toBe(true);
      const kept = result.entries.filter((entry) => entry.action === "keep");
      expect(kept.map((entry) => entry.reason)).toEqual(
        expect.arrayContaining(["within TTL", "current baseline runtime"]),
      );
    });
  });

  test("prepare mode (pruneRuntimes false) never touches runtimes", async () => {
    await withIsolatedHome(async () => {
      seedAgedDir(join(runsRoot(), "old-run"), 25);
      seedAgedDir(join(managedRuntimesRoot(), OLD_ID), 100);

      const result = cleanupSandboxArtifacts({ pruneRuntimes: false });

      expect(result.removedCount).toBe(1);
      expect(result.entries.every((entry) => entry.kind === "run")).toBe(true);
      expect(existsSync(join(managedRuntimesRoot(), OLD_ID))).toBe(true);
    });
  });

  test("skips runtime reclamation without currentRuntimeId (fail-safe)", async () => {
    await withIsolatedHome(async () => {
      seedAgedDir(join(managedRuntimesRoot(), OLD_ID), 100);

      const result = cleanupSandboxArtifacts({ pruneRuntimes: true });

      expect(result.entries.every((entry) => entry.kind === "run")).toBe(true);
      expect(existsSync(join(managedRuntimesRoot(), OLD_ID))).toBe(true);
    });
  });

  test("honors a custom TTL", async () => {
    await withIsolatedHome(async () => {
      seedAgedDir(join(runsRoot(), "three-hours"), 3);
      seedAgedDir(join(runsRoot(), "one-hour"), 1);

      const result = cleanupSandboxArtifacts({ runsTtlMs: 2 * HOUR_MS });

      expect(result.removedCount).toBe(1);
      expect(existsSync(join(runsRoot(), "three-hours"))).toBe(false);
      expect(existsSync(join(runsRoot(), "one-hour"))).toBe(true);
    });
  });

  test("default TTL is 24 hours", () => {
    expect(DEFAULT_RUNS_TTL_MS).toBe(24 * HOUR_MS);
  });

  test("ignores stray files and tolerates missing roots", async () => {
    await withIsolatedHome(async () => {
      // 根目录尚不存在
      const empty = cleanupSandboxArtifacts({ pruneRuntimes: true, currentRuntimeId: CURRENT_ID });
      expect(empty.entries).toHaveLength(0);
      expect(empty.removedCount).toBe(0);

      // 只有散落文件，无子目录
      mkdirSync(runsRoot(), { recursive: true });
      writeFileSync(join(runsRoot(), "stray.txt"), "x", "utf8");
      mkdirSync(managedRuntimesRoot(), { recursive: true });
      writeFileSync(join(managedRuntimesRoot(), "stray.txt"), "x", "utf8");
      const filesOnly = cleanupSandboxArtifacts({
        pruneRuntimes: true,
        currentRuntimeId: CURRENT_ID,
      });
      expect(filesOnly.entries).toHaveLength(0);
      expect(existsSync(join(runsRoot(), "stray.txt"))).toBe(true);
    });
  });
});
