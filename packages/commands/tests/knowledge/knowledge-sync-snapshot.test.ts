import { mkdtemp, writeFile, readFile, rm, stat, symlink, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { withSyncFileSnapshot } from "../../src/commands/knowledge/sync/snapshot.ts";
const directories: string[] = [];
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "sync-snapshot-test-")));
  directories.push(directory);
  const absolutePath = join(directory, "中文 note.md");
  const content = "planned contents";
  await writeFile(absolutePath, content);
  return {
    relativePath: basename(absolutePath),
    absolutePath,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    contentMd5: createHash("md5").update(content).digest("hex"),
    size: Buffer.byteLength(content),
    mtimeMs: (await stat(absolutePath)).mtimeMs,
  };
}
test("snapshot preserves basename and contents despite later source edits and is private and removed", async () => {
  const file = await fixture();
  let temporaryPath = "";
  const result = await withSyncFileSnapshot(file, localize, async (snapshot) => {
    temporaryPath = snapshot.absolutePath;
    expect(basename(temporaryPath)).toBe(file.relativePath);
    expect((await stat(temporaryPath)).mode & 0o777).toBe(0o600);
    await writeFile(file.absolutePath, "source now changed");
    expect(await readFile(temporaryPath, "utf8")).toBe("planned contents");
    return "uploaded";
  });
  expect(result).toBe("uploaded");
  await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
});
test("same size modified content is rejected before upload", async () => {
  const file = await fixture();
  await writeFile(file.absolutePath, "altered contents");
  const upload = vi.fn();
  await expect(withSyncFileSnapshot(file, localize, upload)).rejects.toThrow("changed");
  expect(upload).not.toHaveBeenCalled();
});
test("symlink replacement is rejected", async () => {
  const file = await fixture();
  const other = join(directories[0], "other.md");
  await writeFile(other, "planned contents");
  await rm(file.absolutePath);
  await symlink(other, file.absolutePath);
  await expect(withSyncFileSnapshot(file, localize, vi.fn())).rejects.toThrow();
});
test("upload errors are preserved and snapshot is cleaned", async () => {
  const file = await fixture();
  const error = new Error("upload failed");
  let temporaryPath = "";
  await expect(
    withSyncFileSnapshot(file, localize, async (snapshot) => {
      temporaryPath = snapshot.absolutePath;
      throw error;
    }),
  ).rejects.toBe(error);
  await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
});

test("multi-chunk documents are streamed without truncating earlier chunks", async () => {
  const file = await fixture();
  const content = Buffer.alloc(200000, "x");
  content.write("last chunk", content.length - 10);
  await writeFile(file.absolutePath, content);
  file.size = content.length;
  file.contentSha256 = createHash("sha256").update(content).digest("hex");
  file.contentMd5 = createHash("md5").update(content).digest("hex");
  await withSyncFileSnapshot(file, localize, async (snapshot) => {
    expect(await readFile(snapshot.absolutePath)).toEqual(content);
  });
});
