import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, test } from "vite-plus/test";
import {
  emptySkillLock,
  getSkillLockPath,
  getSkillsDir,
  readSkillLock,
  upsertSkillLockEntry,
  writeSkillLock,
} from "../src/skills/lock.ts";

/** Run in an isolated temp config dir, restore env afterwards. */
async function inTempConfigDir(fn: () => Promise<void>): Promise<void> {
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "bl-skill-lock-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("skill-lock: paths follow BAILIAN_CONFIG_DIR", async () => {
  await inTempConfigDir(async () => {
    expect(getSkillsDir()).toBe(join(process.env.BAILIAN_CONFIG_DIR!, "skills"));
    expect(getSkillLockPath()).toBe(join(getSkillsDir(), "skill-lock.json"));
  });
});

test("skill-lock: first install (file absent) returns empty table, not an error", async () => {
  await inTempConfigDir(async () => {
    expect(readSkillLock()).toEqual(emptySkillLock());
  });
});

test("skill-lock: written data reads back with links/sourceType", async () => {
  await inTempConfigDir(async () => {
    const lock = emptySkillLock();
    lock.skills["spark-video"] = {
      contentHash: "sha256:abc",
      publishedAt: "2026-07-23T00:00:00+08:00",
      installedAt: "2026-07-23T00:00:00Z",
      sourceType: "oss",
      links: ["/tmp/x/.claude/skills/spark-video"],
    };
    writeSkillLock(lock);
    expect(readSkillLock()).toEqual(lock);
  });
});

test("skill-lock: corrupted JSON / unrecognized version → treated as empty table", async () => {
  await inTempConfigDir(async () => {
    mkdirSync(getSkillsDir(), { recursive: true });
    writeFileSync(getSkillLockPath(), "{ not json");
    expect(readSkillLock()).toEqual(emptySkillLock());

    writeFileSync(getSkillLockPath(), JSON.stringify({ version: 99, skills: {} }));
    expect(readSkillLock()).toEqual(emptySkillLock());

    writeFileSync(getSkillLockPath(), JSON.stringify({ version: 1 }));
    expect(readSkillLock()).toEqual(emptySkillLock());
  });
});

test("skill-lock: upsert shallow-merge — silent sync channel does not overwrite links written by add", async () => {
  await inTempConfigDir(async () => {
    // upsert on empty table = create entry (postinstall first-time bookkeeping scenario)
    upsertSkillLockEntry("bailian-docs-llm-wiki", {
      contentHash: "sha256:v1",
      installedAt: "2026-07-23T00:00:00Z",
      sourceType: "oss",
    });
    expect(readSkillLock().skills["bailian-docs-llm-wiki"].contentHash).toBe("sha256:v1");

    // After bl skill add adds links, advisor sync only updates the fingerprint → links preserved
    upsertSkillLockEntry("bailian-docs-llm-wiki", {
      contentHash: "sha256:v1",
      installedAt: "2026-07-23T01:00:00Z",
      sourceType: "oss",
      links: ["/tmp/x/.claude/skills/bailian-docs-llm-wiki"],
    });
    upsertSkillLockEntry("bailian-docs-llm-wiki", {
      contentHash: "sha256:v2",
      installedAt: "2026-07-24T00:00:00Z",
      sourceType: "oss",
    });
    const entry = readSkillLock().skills["bailian-docs-llm-wiki"];
    expect(entry.contentHash).toBe("sha256:v2");
    expect(entry.links).toEqual(["/tmp/x/.claude/skills/bailian-docs-llm-wiki"]);
    // Other skills' entries are unaffected
    upsertSkillLockEntry("other", {
      contentHash: "sha256:v9",
      installedAt: "2026-07-24T00:00:00Z",
      sourceType: "oss",
    });
    expect(readSkillLock().skills["bailian-docs-llm-wiki"].contentHash).toBe("sha256:v2");
  });
});
