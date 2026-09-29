import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { readSyncCheckpoint } from "../../src/commands/knowledge/sync/state.ts";
import {
  readStateSnapshot,
  assertStateRevision,
} from "../../src/commands/knowledge/state-store.ts";

const directories: string[] = [];
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const target = {
  endpointOrigin: "https://example.com",
  workspaceId: "ws",
  indexId: "index",
  categoryId: "category",
};
const syncId = "3c4e5635-7b2e-4a1d-813b-c848586e0ea9";
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "state-revision-"));
  directories.push(directory);
  return { directory, path: join(directory, "state.json") };
}
test("sync checkpoint binds validated state and revision to the requested target", async () => {
  const { path } = await fixture();
  expect(await readSyncCheckpoint(path, target, syncId, localize)).toEqual({
    state: undefined,
    revision: null,
  });
  const state = { schemaVersion: 1, syncId, target, entries: {}, pending: [] };
  const bytes = JSON.stringify(state, null, 2);
  await writeFile(path, bytes);
  expect(await readSyncCheckpoint(path, target, syncId, localize)).toEqual({
    state,
    revision: createHash("sha256").update(bytes).digest("hex"),
  });
  for (const field of ["endpointOrigin", "workspaceId", "indexId", "categoryId"]) {
    await expect(
      readSyncCheckpoint(path, { ...target, [field]: "different" }, syncId, localize),
    ).rejects.toMatchObject({ exitCode: 1 });
  }
  await expect(
    readSyncCheckpoint(path, target, "b4625e82-d27d-43cd-9765-c8996f450c61", localize),
  ).rejects.toMatchObject({ exitCode: 1 });
  expect(await readFile(path, "utf8")).toBe(bytes);
});
test("missing state has a null revision and reading creates no directories", async () => {
  const { directory } = await fixture();
  const path = join(directory, "missing/state.json");
  expect(await readStateSnapshot(path, localize)).toEqual({ value: undefined, revision: null });
  await assertStateRevision(path, null, localize);
  expect(await readdir(directory)).toEqual([]);
});
test("revision hashes the exact bytes parsed, including whitespace and unicode", async () => {
  const { path } = await fixture();
  const contents = '{ "name": "资料" }\n';
  await writeFile(path, contents);
  expect(await readStateSnapshot(path, localize)).toEqual({
    value: { name: "资料" },
    revision: createHash("sha256").update(contents).digest("hex"),
  });
  const { revision } = await readStateSnapshot(path, localize);
  await assertStateRevision(path, revision, localize);
  await writeFile(path, JSON.stringify({ name: "资料" }));
  await expect(assertStateRevision(path, revision, localize)).rejects.toMatchObject({
    exitCode: 1,
    message: expect.stringContaining("changed"),
  });
});
test("a newly created or removed checkpoint invalidates the previous plan", async () => {
  const { path } = await fixture();
  await writeFile(path, "{}");
  await expect(assertStateRevision(path, null, localize)).rejects.toMatchObject({ exitCode: 1 });
  const { revision } = await readStateSnapshot(path, localize);
  await rm(path);
  await expect(assertStateRevision(path, revision, localize)).rejects.toMatchObject({
    exitCode: 1,
  });
});
test("malformed JSON and I/O failures are not treated as an absent checkpoint", async () => {
  const { directory, path } = await fixture();
  await writeFile(path, "broken");
  await expect(readStateSnapshot(path, localize)).rejects.toMatchObject({ exitCode: 1 });
  await expect(readStateSnapshot(directory, localize)).rejects.toMatchObject({ code: "EISDIR" });
});
test("stale-plan diagnostic supports Chinese", async () => {
  const { path } = await fixture();
  await writeFile(path, "{}");
  await expect(
    assertStateRevision(path, null, (text) => (typeof text === "string" ? text : text["zh-CN"])),
  ).rejects.toMatchObject({ message: expect.stringContaining("重新预览") });
});
