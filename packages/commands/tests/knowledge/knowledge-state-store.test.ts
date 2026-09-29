import { mkdtemp, readFile, writeFile, readdir, mkdir, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import {
  readStateFile,
  writeStateFile,
  withStateLock,
} from "../../src/commands/knowledge/state-store.ts";

const directories: string[] = [];
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-state-"));
  directories.push(directory);
  return { directory, path: join(directory, ".bailian", "state.json") };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("reading absent state does not create the containing directory", async () => {
  const { directory, path } = await fixture();
  expect(await readStateFile(path, localize)).toBeUndefined();
  expect(await readdir(directory)).toEqual([]);
});

test("state round trips with private permissions and leaves no temporary file", async () => {
  const { path } = await fixture();
  await writeStateFile(path, { schemaVersion: 1, entries: { "目录/a.md": "file-1" } });
  expect(await readStateFile(path, localize)).toEqual({
    schemaVersion: 1,
    entries: { "目录/a.md": "file-1" },
  });
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readdir(join(path, ".."))).toEqual(["state.json"]);
});

test("corrupt JSON fails instead of masquerading as first execution", async () => {
  const { directory } = await fixture();
  const path = join(directory, "broken.json");
  await writeFile(path, "{broken");
  await expect(readStateFile(path, localize)).rejects.toMatchObject({
    exitCode: 1,
    message: expect.stringContaining(path),
  });
});

test("failed serialization keeps the previous checkpoint intact", async () => {
  const { path } = await fixture();
  await writeStateFile(path, { phase: "uploaded" });
  await expect(writeStateFile(path, { unsupported: 1n })).rejects.toThrow();
  expect(await readStateFile(path, localize)).toEqual({ phase: "uploaded" });
  expect(await readdir(join(path, ".."))).toEqual(["state.json"]);
});

test("failed rename removes only its temporary file, not the existing destination", async () => {
  const { directory, path } = await fixture();
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "sentinel"), "keep");
  await expect(writeStateFile(path, { phase: "ready" })).rejects.toThrow();
  expect(await readFile(join(path, "sentinel"), "utf8")).toBe("keep");
  expect(await readdir(join(directory, ".bailian"))).toEqual(["state.json"]);
});

test("a concurrent writer cannot enter the same state lock", async () => {
  const { path } = await fixture();
  let unlock!: () => void;
  let entered!: () => void;
  const holding = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const first = withStateLock(path, localize, async () => {
    entered();
    await holding;
    return "first";
  });
  await ready;
  const lockBefore = await readFile(`${path}.lock`, "utf8");
  try {
    await expect(withStateLock(path, localize, async () => "second")).rejects.toMatchObject({
      exitCode: 1,
    });
    expect(await readFile(`${path}.lock`, "utf8")).toBe(lockBefore);
  } finally {
    unlock();
  }
  expect(await first).toBe("first");
  expect(await withStateLock(path, localize, async () => "third")).toBe("third");
});

test("execution errors release the lock and remain the original error", async () => {
  const { path } = await fixture();
  const original = new Error("service failed");
  await expect(
    withStateLock(path, localize, async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  expect(await readdir(join(path, ".."))).toEqual([]);
});

test("a replaced lock is not removed by the previous owner", async () => {
  const { path } = await fixture();
  await withStateLock(path, localize, async () => {
    await writeFile(`${path}.lock`, JSON.stringify({ nonce: "another-owner" }));
  });
  expect(JSON.parse(await readFile(`${path}.lock`, "utf8")).nonce).toBe("another-owner");
});
