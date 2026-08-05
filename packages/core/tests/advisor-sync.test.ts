import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { maybeSyncWikiData } from "../src/advisor/sync.ts";
import { readSkillLock } from "../src/skills/lock.ts";

const WIKI_SKILL_NAME = "bailian-docs-llm-wiki";
const CONTENT_HASH = `sha256:${"a".repeat(64)}`;

/** Isolated HOME/XDG/BAILIAN_CONFIG_DIR; agent config-dir overrides cleared for determinism */
async function inFakeHome(fn: (home: string) => Promise<void>): Promise<void> {
  const saved = {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    BAILIAN_CONFIG_DIR: process.env.BAILIAN_CONFIG_DIR,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
  };
  const home = mkdtempSync(join(tmpdir(), "bl-advisor-sync-"));
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, ".config");
  process.env.BAILIAN_CONFIG_DIR = join(home, ".bailian");
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CODEX_HOME;
  try {
    await fn(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
}

/** Stub the registry fetch to serve a wiki entry with the given fingerprint */
function stubRegistryIndex() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      skills: {
        [WIKI_SKILL_NAME]: { contentHash: CONTENT_HASH, publishedAt: "2026-08-01 10:00:00" },
      },
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Seed what postinstall leaves behind: canonical data + expired state + lock entry WITHOUT links */
function seedPostinstallState(configDir: string): void {
  const catalogDir = join(configDir, "skills", WIKI_SKILL_NAME);
  mkdirSync(join(catalogDir, "models"), { recursive: true });
  writeFileSync(join(catalogDir, "models", "models.jsonl"), "{}\n");
  writeFileSync(join(catalogDir, "SKILL.md"), "---\nname: wiki\ndescription: docs\n---\n");
  // State older than the 12h throttle so the hash-hit branch is reached
  writeFileSync(
    join(configDir, "wiki-sync-state.json"),
    JSON.stringify({ lastChecked: Date.now() - 13 * 3600_000, contentHash: CONTENT_HASH }),
  );
  writeFileSync(
    join(configDir, "skills", "skill-lock.json"),
    JSON.stringify({
      version: 1,
      skills: {
        [WIKI_SKILL_NAME]: {
          contentHash: CONTENT_HASH,
          installedAt: "2026-08-01T00:00:00.000Z",
          sourceType: "oss",
        },
      },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("advisor sync: hash-hit backfills fan-out links missing from postinstall lock entry", async () => {
  await inFakeHome(async (home) => {
    seedPostinstallState(process.env.BAILIAN_CONFIG_DIR!);
    mkdirSync(join(home, ".claude"), { recursive: true });
    const fetchMock = stubRegistryIndex();

    const updated = await maybeSyncWikiData();

    // Content unchanged → no data update, but the fan-out gap is repaired
    expect(updated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const locked = readSkillLock().skills[WIKI_SKILL_NAME];
    expect(locked?.links).toEqual([join(home, ".claude", "skills", WIKI_SKILL_NAME)]);

    // Second run: fresh throttle + links already recorded → no fetch, no rewrite
    await maybeSyncWikiData();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

test("advisor sync: hash-hit keeps an existing links array untouched", async () => {
  await inFakeHome(async (home) => {
    seedPostinstallState(process.env.BAILIAN_CONFIG_DIR!);
    // Upgrade the lock entry to "already fanned out" shape
    const existingLink = join(home, ".claude", "skills", WIKI_SKILL_NAME);
    const lockPath = join(process.env.BAILIAN_CONFIG_DIR!, "skills", "skill-lock.json");
    const lockContent = JSON.parse(readFileSync(lockPath, "utf-8"));
    lockContent.skills[WIKI_SKILL_NAME].links = [existingLink];
    writeFileSync(lockPath, JSON.stringify(lockContent));
    mkdirSync(join(home, ".claude"), { recursive: true });
    stubRegistryIndex();

    await maybeSyncWikiData();

    expect(readSkillLock().skills[WIKI_SKILL_NAME]?.links).toEqual([existingLink]);
  });
});
