import * as filesystem from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { scanSyncDirectory } from "../../src/commands/knowledge/sync/scan.ts";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const directories: string[] = [];
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => filesystem.rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await filesystem.mkdtemp(join(tmpdir(), "sync-scan-"));
  directories.push(root);
  return root;
}
async function put(root: string, path: string, content = "content") {
  const absolute = join(root, path);
  await filesystem.mkdir(join(absolute, ".."), { recursive: true });
  await filesystem.writeFile(absolute, content);
}
test("hashes every supported file and keeps same names in separate directories", async () => {
  const root = await fixture();
  await put(root, "one/a.md", "first");
  await put(root, "two/a.md", "second");
  await put(root, "中文 空格.md");
  const result = await scanSyncDirectory(root, join(root, ".bailian/state.json"), localize);
  expect(result.files.map((file) => file.relativePath)).toEqual([
    "one/a.md",
    "two/a.md",
    "中文 空格.md",
  ]);
  expect(result.files[0]).toMatchObject({
    contentSha256: createHash("sha256").update("first").digest("hex"),
    contentMd5: createHash("md5").update("first").digest("hex"),
    size: 5,
  });
});
test("same size and mtime cannot conceal changed content; mtime alone does not change hashes", async () => {
  const root = await fixture();
  const path = join(root, "a.md");
  await put(root, "a.md", "one");
  const first = (await scanSyncDirectory(root, join(root, "state.json"), localize)).files[0]!;
  await filesystem.writeFile(path, "two");
  await filesystem.utimes(path, new Date(first.mtimeMs), new Date(first.mtimeMs));
  const second = (await scanSyncDirectory(root, join(root, "state.json"), localize)).files[0]!;
  expect(second.contentSha256).not.toBe(first.contentSha256);
  await filesystem.utimes(path, new Date(), new Date(Date.now() + 10000));
  expect(
    (await scanSyncDirectory(root, join(root, "state.json"), localize)).files[0]!.contentSha256,
  ).toBe(second.contentSha256);
});
test("excludes metadata, checkpoint artifacts and media with explicit skipped records", async () => {
  const root = await fixture();
  for (const path of [
    ".git/a.md",
    "node_modules/a.md",
    ".bailian/a.md",
    "state.md",
    "state.md.lock",
    ".state.md.temporary.tmp",
    "movie.mp4",
    "script.ts",
  ])
    await put(root, path);
  const result = await scanSyncDirectory(root, join(root, "state.md"), localize);
  expect(result.files).toEqual([]);
  expect(result.skipped.map((entry) => entry.relativePath)).toEqual(
    expect.arrayContaining([
      ".git",
      "node_modules",
      ".bailian",
      "state.md",
      "state.md.lock",
      ".state.md.temporary.tmp",
      "movie.mp4",
      "script.ts",
    ]),
  );
});
test("does not follow file or directory symlinks outside the source", async () => {
  const root = await fixture();
  const outside = await fixture();
  await put(outside, "secret.md");
  await filesystem.symlink(outside, join(root, "linked-dir"));
  await filesystem.symlink(join(outside, "secret.md"), join(root, "linked.md"));
  const result = await scanSyncDirectory(root, join(root, "state.json"), localize);
  expect(result.files).toEqual([]);
  expect(result.skipped.every((entry) => entry.reason === "symlink")).toBe(true);
});
test("empty source is a valid complete scan and creates no state directory", async () => {
  const root = await fixture();
  expect(await scanSyncDirectory(root, join(root, ".bailian/state.json"), localize)).toEqual({
    files: [],
    skipped: [],
    warnings: [],
  });
  expect(await filesystem.readdir(root)).toEqual([]);
});
test("read errors fail the whole scan rather than returning a partial inventory", async () => {
  const root = await fixture();
  await put(root, "a.md");
  vi.spyOn(filesystem, "open").mockRejectedValue(
    Object.assign(new Error("denied"), { code: "EACCES" }),
  );
  await expect(scanSyncDirectory(root, join(root, "state.json"), localize)).rejects.toMatchObject({
    code: "EACCES",
  });
});
test("source disappearance fails rather than appearing to be an empty directory", async () => {
  const root = await fixture();
  await filesystem.rm(root, { recursive: true });
  await expect(scanSyncDirectory(root, join(root, "state.json"), localize)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("mutation during hashing invalidates the whole scan", async () => {
  const root = await fixture();
  await put(root, "a.md", "before");
  const source = join(await filesystem.realpath(root), "a.md");
  const originalLstat = filesystem.lstat;
  let reads = 0;
  vi.spyOn(filesystem, "lstat").mockImplementation(async (...args) => {
    if (args[0] === source && ++reads === 2)
      await filesystem.writeFile(source, "mutated during scan");
    return originalLstat(...args);
  });
  await expect(scanSyncDirectory(root, join(root, "state.json"), localize)).rejects.toMatchObject({
    exitCode: 1,
    message: expect.stringContaining("changed during scanning"),
  });
});

test("a symbolic link cannot be supplied as the source directory", async () => {
  const root = await fixture();
  const outside = await fixture();
  await filesystem.symlink(outside, join(root, "source"));
  await expect(
    scanSyncDirectory(join(root, "source"), join(root, "state.json"), localize),
  ).rejects.toMatchObject({ exitCode: 2 });
});

test("a directory replacing a managed file remains visible as a type conflict", async () => {
  const { planSync } = await import("../../src/commands/knowledge/sync/plan.ts");
  const root = await fixture();
  await put(root, "a.md");
  const previous = (await scanSyncDirectory(root, join(root, "state.json"), localize)).files[0];
  await filesystem.rm(join(root, "a.md"));
  await filesystem.mkdir(join(root, "a.md"));
  const scan = await scanSyncDirectory(root, join(root, "state.json"), localize);
  const plan = planSync({
    local: scan.files,
    skipped: scan.skipped,
    managed: [{ ...previous, fileId: "file", docId: "doc" }],
    deleteEnabled: true,
  });
  expect(plan.blocked).toBe(true);
  expect(plan.actions[0].action).toBe("conflict");
  expect(plan.counts.delete).toBe(0);
});
