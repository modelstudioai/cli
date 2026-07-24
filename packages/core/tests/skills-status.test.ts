import { expect, test } from "vite-plus/test";
import { sanitizeSkillName, isSafeSkillName } from "../src/skills/sanitize.ts";
import { computeSkillStatuses } from "../src/skills/status.ts";
import type { SkillLockFile, SkillsIndex } from "../src/skills/types.ts";

const PUB = "2026-07-23T00:00:00+08:00";

function makeIndex(skills: Record<string, string>): SkillsIndex {
  return {
    version: 1,
    skills: Object.fromEntries(
      Object.entries(skills).map(([name, contentHash]) => [
        name,
        { contentHash, publishedAt: PUB },
      ]),
    ),
  };
}

function makeLock(skills: Record<string, string>): SkillLockFile {
  return {
    version: 1,
    skills: Object.fromEntries(
      Object.entries(skills).map(([name, contentHash]) => [
        name,
        { contentHash, installedAt: "2026-07-23T00:00:00Z", sourceType: "oss" as const },
      ]),
    ),
  };
}

test("status: five-state derivation matrix", () => {
  const index = makeIndex({ a: "h-a2", b: "h-b", c: "h-c", d: "h-d", e: "h-e" });
  const lock = makeLock({ a: "h-a1", b: "h-b", e: "h-e", zombie: "h-z" });
  //  a: lock h-a1 / remote h-a2 / on disk        → outdated
  //  b: lock h-b  / remote h-b  / on disk        → installed
  //  c: no lock / on disk (synced by other channel)  → untracked
  //  d: no lock / not on disk                    → not-installed
  //  e: lock h-e / dir deleted                   → missing
  //  zombie: in lock / delisted from remote / on disk → installed (retained locally)
  //  stray: on disk / in neither lock nor remote → untracked
  const rows = computeSkillStatuses(index, lock, ["a", "b", "c", "zombie", "stray"]);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  expect(byName.a.status).toBe("outdated");
  expect(byName.a.publishedAt).toBe(PUB);
  expect(byName.b.status).toBe("installed");
  expect(byName.c.status).toBe("untracked");
  expect(byName.c.publishedAt).toBe(PUB);
  expect(byName.d.status).toBe("not-installed");
  expect(byName.e.status).toBe("missing");
  expect(byName.zombie.status).toBe("installed");
  expect(byName.zombie.publishedAt).toBeUndefined();
  expect(byName.stray.status).toBe("untracked");
  expect(rows.map((r) => r.name)).toEqual(rows.map((r) => r.name).sort());
});

test("status: first use (empty lock + empty disk) → all not-installed", () => {
  const rows = computeSkillStatuses(makeIndex({ a: "1", b: "2" }), makeLock({}), []);
  expect(rows.every((r) => r.status === "not-installed")).toBe(true);
});

test("status: empty remote registry + nothing local → empty list", () => {
  expect(computeSkillStatuses(makeIndex({}), makeLock({}), [])).toEqual([]);
});

test("sanitize: path traversal/illegal chars sanitized, safe names unchanged", () => {
  expect(sanitizeSkillName("../../.ssh")).toBe("ssh");
  expect(sanitizeSkillName("My Cool Skill!!")).toBe("My-Cool-Skill!!");
  expect(sanitizeSkillName("a/b\\c:d")).toBe("a-b-c-d");
  expect(sanitizeSkillName("...")).toBe("unnamed-skill");
  expect(isSafeSkillName("spark-video")).toBe(true);
  expect(isSafeSkillName("bailian.model_v2")).toBe(true);
  expect(isSafeSkillName("../evil")).toBe(false);
  expect(isSafeSkillName("a b")).toBe(false);
  expect(isSafeSkillName("")).toBe(false);
});
