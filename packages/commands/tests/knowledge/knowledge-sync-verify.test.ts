import { mkdtemp, realpath, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { Client, LocalizedText } from "bailian-cli-core";
import { scanSyncDirectory } from "../../src/commands/knowledge/sync/scan.ts";
import { verifySyncInputs } from "../../src/commands/knowledge/sync/verify.ts";
import type { SyncRemoteInventory } from "../../src/commands/knowledge/sync/remote.ts";
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "sync-verify-")));
  directories.push(directory);
  await writeFile(join(directory, "a.md"), "first");
  const stateFile = join(directory, ".bailian", "sync-state.json");
  const scan = await scanSyncDirectory(directory, stateFile, localize);
  const requestJson = vi
    .fn()
    .mockResolvedValueOnce({ data: { fileList: [] } })
    .mockResolvedValueOnce({ data: { rows: [], total_count: 0 } });
  const remote: SyncRemoteInventory = { linked: [], unindexed: [], unmanaged: [] };
  return {
    directory,
    stateFile,
    scan,
    remote,
    requestJson,
    client: { requestJson } as unknown as Client,
    target: {
      workspaceId: "ws",
      indexId: "index",
      categoryId: "category",
      scopeTag: `s${"a".repeat(31)}`,
    },
    localize,
  };
}
test("unchanged complete inputs pass with read-only requests", async () => {
  const input = await fixture();
  await verifySyncInputs(input);
  expect(input.requestJson).toHaveBeenCalledTimes(2);
  expect(input.requestJson.mock.calls.every(([request]) => !request.path.includes("delete"))).toBe(
    true,
  );
});
test.each(["modify", "add", "remove"])(
  "local %s after confirmation invalidates the whole plan",
  async (change) => {
    const input = await fixture();
    if (change === "modify") await writeFile(join(input.directory, "a.md"), "other");
    if (change === "add") await writeFile(join(input.directory, "b.md"), "new");
    if (change === "remove") await rm(join(input.directory, "a.md"));
    await expect(verifySyncInputs(input)).rejects.toThrow("changed");
    expect(input.requestJson).not.toHaveBeenCalled();
  },
);
test("changed remote inventory invalidates the plan", async () => {
  const input = await fixture();
  input.remote.unmanaged.push({ docId: "vanished" });
  await expect(verifySyncInputs(input)).rejects.toThrow("changed");
});
test("metadata-only local mtime changes do not alter content plan", async () => {
  const input = await fixture();
  input.scan.files[0].mtimeMs -= 1000;
  await expect(verifySyncInputs(input)).resolves.toBeUndefined();
});

test("creating the checkpoint directory and lock does not invalidate the approved plan", async () => {
  const input = await fixture();
  await mkdir(dirname(input.stateFile));
  await writeFile(`${input.stateFile}.lock`, "lock metadata");
  await expect(verifySyncInputs(input)).resolves.toBeUndefined();
});

test("creating custom nested checkpoint parents does not invalidate a plan", async () => {
  const input = await fixture();
  input.stateFile = join(input.directory, "metadata", "nested", "sync.json");
  input.scan = await scanSyncDirectory(input.directory, input.stateFile, localize);
  await mkdir(dirname(input.stateFile), { recursive: true });
  await writeFile(`${input.stateFile}.lock`, "lock metadata");
  await expect(verifySyncInputs(input)).resolves.toBeUndefined();
});

test("a directory appearing at a previously absent path invalidates a deletion preview", async () => {
  const input = await fixture();
  await mkdir(join(input.directory, "previously-deleted.md"));
  await expect(verifySyncInputs(input)).rejects.toThrow("changed");
  expect(input.requestJson).not.toHaveBeenCalled();
});
