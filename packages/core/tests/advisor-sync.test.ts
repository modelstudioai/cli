import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { withIsolatedHome } from "./helpers/isolation.ts";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { maybeSyncWikiData } from "../src/advisor/sync.ts";
import { readSkillLock } from "../src/skills/lock.ts";

// A real system-wide Codex/ZCode installation must not change this fixture's
// one-agent fan-out expectation. Ordinary temporary-home files remain real.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
      path === "/etc/codex" || path === "/Applications/ZCode.app" ? false : actual.existsSync(path),
  };
});

const WIKI_SKILL_NAME = "bailian-docs-llm-wiki";
const CONTENT_HASH = `sha256:${"a".repeat(64)}`;

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
  await withIsolatedHome(async (home) => {
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
  await withIsolatedHome(async (home) => {
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
