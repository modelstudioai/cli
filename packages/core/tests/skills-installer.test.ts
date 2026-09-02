import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import tar from "tar-stream";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { BailianError } from "../src/errors/base.ts";
import type { AgentTarget } from "../src/skills/agents.ts";
import { isSafeEntryName } from "../src/skills/extract.ts";
import { installSkillFromBuffer, installSkillWithFanout } from "../src/skills/installer.ts";
import { getSkillsDir } from "../src/skills/lock.ts";
import { downloadSkillAsset, fetchSkillsIndex } from "../src/skills/registry.ts";

/** rmSync wrapped in a spy so tests can simulate host deletion guards (e.g. safe-delete) */
const fsMocks = vi.hoisted(() => ({
  rmSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  fsMocks.rmSync.mockImplementation(actual.rmSync);
  return { ...actual, rmSync: fsMocks.rmSync };
});

/** Run in an isolated temp config dir, restore env afterwards. */
async function inTempConfigDir(fn: () => Promise<void>): Promise<void> {
  const saved = process.env.BAILIAN_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "bl-skill-install-"));
  process.env.BAILIAN_CONFIG_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = saved;
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Build a skill archive the same way as the publisher (tar.pack + brotli) */
async function buildTarBr(files: Record<string, string>): Promise<Buffer> {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolvePromise, reject) => {
    pack.on("end", resolvePromise);
    pack.on("error", reject);
  });
  for (const [rel, content] of Object.entries(files)) {
    pack.entry({ name: rel }, content);
  }
  pack.finalize();
  await done;
  return brotliCompressSync(Buffer.concat(chunks));
}

const VALID_SKILL_MD = "---\nname: demo\ndescription: demo skill\n---\n\n# Demo v1\n";

test("installer: valid archive installs to canonical and returns metadata", async () => {
  await inTempConfigDir(async () => {
    const buf = await buildTarBr({
      "SKILL.md": VALID_SKILL_MD,
      "references/usage.md": "# usage\n",
    });
    const installed = await installSkillFromBuffer("demo", buf);
    expect(installed).toMatchObject({
      name: "demo",
      meta: { name: "demo", description: "demo skill" },
    });
    expect(readFileSync(join(getSkillsDir(), "demo", "SKILL.md"), "utf-8")).toBe(VALID_SKILL_MD);
    expect(existsSync(join(getSkillsDir(), "demo", "references", "usage.md"))).toBe(true);
    // No temp/backup dirs left behind
    expect(readdirSync(getSkillsDir()).filter((e) => e !== "demo")).toEqual([]);
  });
});

test("installer: reinstall atomically swaps, no old files left behind", async () => {
  await inTempConfigDir(async () => {
    await installSkillFromBuffer(
      "demo",
      await buildTarBr({ "SKILL.md": VALID_SKILL_MD, "old-only.md": "v1\n" }),
    );
    const v2 = "---\nname: demo\ndescription: demo skill v2\n---\n";
    await installSkillFromBuffer("demo", await buildTarBr({ "SKILL.md": v2 }));
    expect(readFileSync(join(getSkillsDir(), "demo", "SKILL.md"), "utf-8")).toBe(v2);
    expect(existsSync(join(getSkillsDir(), "demo", "old-only.md"))).toBe(false);
  });
});

test("installer: tar-slip entry → rejected and canonical not written", async () => {
  await inTempConfigDir(async () => {
    const buf = await buildTarBr({ "SKILL.md": VALID_SKILL_MD, "../evil.txt": "pwned\n" });
    await expect(installSkillFromBuffer("demo", buf)).rejects.toThrow(/unsafe tar entry/);
    expect(existsSync(join(getSkillsDir(), "demo"))).toBe(false);
    expect(existsSync(join(process.env.BAILIAN_CONFIG_DIR!, "evil.txt"))).toBe(false);
  });
});

test("installer: backslash entry names rejected (Windows tar-slip vector)", async () => {
  await inTempConfigDir(async () => {
    const buf = await buildTarBr({
      "SKILL.md": VALID_SKILL_MD,
      "foo\\..\\evil.txt": "pwned\n",
    });
    await expect(installSkillFromBuffer("demo", buf)).rejects.toThrow(/unsafe tar entry/);
    expect(existsSync(join(getSkillsDir(), "demo"))).toBe(false);
  });
});

test("extract: entry name safety rules", async () => {
  expect(isSafeEntryName("SKILL.md")).toBe(true);
  expect(isSafeEntryName("references/usage.md")).toBe(true);
  expect(isSafeEntryName("../evil")).toBe(false);
  expect(isSafeEntryName("a/../../evil")).toBe(false);
  expect(isSafeEntryName("/abs/path")).toBe(false);
  expect(isSafeEntryName("C:/windows")).toBe(false);
  // Backslashes: drive-root escape and "\.." expansion on Windows
  expect(isSafeEntryName("foo\\bar")).toBe(false);
  expect(isSafeEntryName("\\evil")).toBe(false);
  expect(isSafeEntryName("foo\\..\\evil")).toBe(false);
  expect(isSafeEntryName("nul\0byte")).toBe(false);
});

test("installer: SKILL.md validation fails → previously installed version preserved as-is", async () => {
  await inTempConfigDir(async () => {
    await installSkillFromBuffer("demo", await buildTarBr({ "SKILL.md": VALID_SKILL_MD }));
    const bad = await buildTarBr({ "README.md": "no skill md\n" });
    await expect(installSkillFromBuffer("demo", bad)).rejects.toThrow(BailianError);
    // Old version untouched, temp dir cleaned up
    expect(readFileSync(join(getSkillsDir(), "demo", "SKILL.md"), "utf-8")).toBe(VALID_SKILL_MD);
    expect(readdirSync(getSkillsDir()).filter((e) => e !== "demo")).toEqual([]);
  });
});

test("installer: invalid skill name rejected outright", async () => {
  await inTempConfigDir(async () => {
    const buf = await buildTarBr({ "SKILL.md": VALID_SKILL_MD });
    await expect(installSkillFromBuffer("../escape", buf)).rejects.toThrow(/Invalid skill name/);
  });
});

/** Same accumulation as publisher computeContentHash: sorted rel path + bytes */
function expectedHashOf(files: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const rel of Object.keys(files).sort()) {
    hash.update(rel);
    hash.update(Buffer.from(files[rel]));
  }
  return `sha256:${hash.digest("hex")}`;
}

test("installer: matching contentHash passes integrity check", async () => {
  await inTempConfigDir(async () => {
    const files = { "SKILL.md": VALID_SKILL_MD, "references/usage.md": "# usage\n" };
    const installed = await installSkillFromBuffer(
      "demo",
      await buildTarBr(files),
      expectedHashOf(files),
    );
    expect(installed.name).toBe("demo");
    expect(existsSync(join(getSkillsDir(), "demo", "SKILL.md"))).toBe(true);
  });
});

test("installer: contentHash mismatch → rejected, previous install preserved", async () => {
  await inTempConfigDir(async () => {
    await installSkillFromBuffer("demo", await buildTarBr({ "SKILL.md": VALID_SKILL_MD }));
    const tampered = await buildTarBr({ "SKILL.md": VALID_SKILL_MD, "extra.md": "tampered\n" });
    await expect(
      installSkillFromBuffer("demo", tampered, expectedHashOf({ "SKILL.md": VALID_SKILL_MD })),
    ).rejects.toThrow(/integrity check/);
    // Old version untouched, temp dir cleaned up
    expect(readFileSync(join(getSkillsDir(), "demo", "SKILL.md"), "utf-8")).toBe(VALID_SKILL_MD);
    expect(existsSync(join(getSkillsDir(), "demo", "extra.md"))).toBe(false);
    expect(readdirSync(getSkillsDir()).filter((e) => e !== "demo")).toEqual([]);
  });
});

// ---- installSkillWithFanout: download + install + fan-out + lock entry in one workflow ----

/** Stub global fetch to serve the given archive for any asset URL */
function stubAssetDownload(tarBrBuffer: Buffer): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        tarBrBuffer.buffer.slice(
          tarBrBuffer.byteOffset,
          tarBrBuffer.byteOffset + tarBrBuffer.byteLength,
        ),
    })),
  );
}

/** Fake agent whose skills dir lives inside the temp config dir (never touches real HOME) */
function fakeAgent(id: string, baseDir: string): AgentTarget {
  return {
    id,
    displayName: id,
    skillsDir: join(baseDir, id, "skills"),
    detectDirs: [join(baseDir, id)],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fanout install: downloads, links agents, and builds lock entry with merged ledger", async () => {
  await inTempConfigDir(async () => {
    const configDir = process.env.BAILIAN_CONFIG_DIR!;
    const files = { "SKILL.md": VALID_SKILL_MD };
    stubAssetDownload(await buildTarBr(files));
    const agent = fakeAgent("claude-code", configDir);
    // Recorded path of an agent absent from this run: must survive into the merged ledger
    const orphanPath = join(configDir, "gone-agent", "skills", "demo");

    const record = await installSkillWithFanout(
      "demo",
      { contentHash: expectedHashOf(files), publishedAt: "2026-08-01 10:00:00" },
      [agent],
      [orphanPath],
    );

    expect(record.linkedAgents).toEqual(["claude-code"]);
    const linkPath = join(agent.skillsDir, "demo");
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(record.lockEntry).toMatchObject({
      contentHash: expectedHashOf(files),
      publishedAt: "2026-08-01 10:00:00",
      sourceType: "oss",
    });
    expect(record.lockEntry.links).toContain(linkPath);
    expect(record.lockEntry.links).toContain(orphanPath);
  });
});

test("fanout install: download failure exhausts retries and leaves no canonical dir", async () => {
  await inTempConfigDir(async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      installSkillWithFanout("demo", { contentHash: "sha256:whatever" }, []),
    ).rejects.toThrow(BailianError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(existsSync(join(getSkillsDir(), "demo"))).toBe(false);
  });
});

// ---- host deletion guards (safe-delete): backup cleanup must not fail a completed install ----

const GUARD_ERROR =
  '[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":1583,"threshold":500}';

test("installer: guard blocking backup deletion does not fail the install", async () => {
  await inTempConfigDir(async () => {
    await installSkillFromBuffer("demo", await buildTarBr({ "SKILL.md": VALID_SKILL_MD }));
    fsMocks.rmSync.mockImplementationOnce(() => {
      throw new Error(GUARD_ERROR);
    });
    const v2 = "---\nname: demo\ndescription: demo skill v2\n---\n";
    const installed = await installSkillFromBuffer("demo", await buildTarBr({ "SKILL.md": v2 }));
    expect(installed.name).toBe("demo");
    expect(readFileSync(join(getSkillsDir(), "demo", "SKILL.md"), "utf-8")).toBe(v2);
    // The blocked backup stays on disk but is inert (status scans ignore .old-*)
    const leftovers = readdirSync(getSkillsDir()).filter((entry) => entry.startsWith("demo.old-"));
    expect(leftovers).toHaveLength(1);
  });
});

test("installer: temp cleanup failure does not mask the original error", async () => {
  await inTempConfigDir(async () => {
    fsMocks.rmSync.mockImplementationOnce(() => {
      throw new Error(GUARD_ERROR);
    });
    const buf = await buildTarBr({ "SKILL.md": VALID_SKILL_MD, "../evil.txt": "pwned\n" });
    await expect(installSkillFromBuffer("demo", buf)).rejects.toThrow(/unsafe tar entry/);
  });
});

// ---- registry retry policy ----

test("registry: index fetch retries transient failures and succeeds", async () => {
  const indexPayload = { skills: { demo: { contentHash: "sha256:abc" } } };
  const fetchMock = vi.fn(async () => {
    if (fetchMock.mock.calls.length < 3) throw new Error("network down");
    return { ok: true, status: 200, json: async () => indexPayload };
  });
  vi.stubGlobal("fetch", fetchMock);
  const index = await fetchSkillsIndex(1000);
  expect(index.skills.demo.contentHash).toBe("sha256:abc");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("registry: attempts=1 keeps the silent channel fail-fast", async () => {
  const fetchMock = vi.fn(async () => {
    throw new Error("network down");
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchSkillsIndex(1000, 1)).rejects.toThrow(BailianError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("registry: asset download retries transient HTTP errors", async () => {
  const fetchMock = vi.fn(async () => {
    if (fetchMock.mock.calls.length === 1) return { ok: false, status: 503 };
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  const buffer = await downloadSkillAsset("demo");
  expect([...buffer]).toEqual([1, 2, 3]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
