import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";
import { RAG_PATHS } from "bailian-cli-core";

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/knowledge-sync-cli.ts",
);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "sync-runtime-"));
  directories.push(directory);
  const docs = join(directory, "docs");
  await mkdir(docs);
  const source = join(docs, "article.md");
  await writeFile(source, "first content");
  const stateFile = join(directory, "state/sync.json");
  const run = (args: string[] = [], failure = "") =>
    runNodeMain(
      fixture,
      [
        "knowledge",
        "doc",
        "sync",
        "--dir",
        docs,
        "--index-id",
        "index-test",
        "--workspace-id",
        "ws-test",
        "--state-file",
        stateFile,
        "--api-key",
        "fake-test-key",
        "--output",
        "json",
        "--quiet",
        "--poll-interval",
        "0.01",
        ...args,
      ],
      {
        cwd: directory,
        env: {
          SYNC_TEST_DIRECTORY: directory,
          SYNC_TEST_FAILURE: failure,
          BAILIAN_CONFIG_DIR: join(directory, "config"),
          DO_NOT_TRACK: "1",
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
        },
      },
    );
  const paths = async () =>
    (await readFile(join(directory, "requests.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).path as string);
  const checkpoint = () => readFile(stateFile, "utf8");
  const remote = async () =>
    JSON.parse(await readFile(join(directory, "fake-remote.json"), "utf8"));
  return { directory, source, stateFile, run, paths, checkpoint, remote };
}
const mutations = [
  RAG_PATHS.applyFileUploadLease,
  RAG_PATHS.addFile,
  RAG_PATHS.indexJobCreate,
  RAG_PATHS.indexDeleteFile,
];

test("sync dry-run reads inventory without creating remote resources, state or lock", async () => {
  const context = await setup();
  const result = await context.run(["--dry-run"]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).plan).toBeDefined();
  for (const path of mutations) expect(await context.paths()).not.toContain(path);
  expect(existsSync(join(context.directory, "state"))).toBe(false);
  expect(existsSync(join(context.directory, "fake-remote.json"))).toBe(false);
});

test("runtime confirms replacements and explicit deletion, preserving unrelated documents and sources", async () => {
  const context = await setup();
  const first = await context.run();
  expect(first.exitCode, first.stderr).toBe(0);
  const checkpoint = await context.checkpoint();
  const count = (await context.paths()).length;
  const repeated = await context.run();
  expect(repeated.exitCode, repeated.stderr).toBe(0);
  expect(await context.checkpoint()).toBe(checkpoint);
  for (const path of mutations) expect((await context.paths()).slice(count)).not.toContain(path);
  await writeFile(context.source, "changed content");
  const beforeRefusal = (await context.paths()).length;
  const refused = await context.run();
  expect(refused.exitCode, refused.stderr).toBe(7);
  expect(await context.checkpoint()).toBe(checkpoint);
  for (const path of mutations)
    expect((await context.paths()).slice(beforeRefusal)).not.toContain(path);
  const beforeReplace = (await context.paths()).length;
  const replaced = await context.run(["--yes"]);
  expect(replaced.exitCode, replaced.stderr).toBe(0);
  const replacementPaths = (await context.paths()).slice(beforeReplace);
  expect(replacementPaths.indexOf(RAG_PATHS.indexDeleteFile)).toBeGreaterThan(
    replacementPaths.indexOf(RAG_PATHS.indexJobStatus),
  );
  expect(
    (await context.remote()).documents.map((entry: { doc_id: string }) => entry.doc_id),
  ).toEqual(["sentinel", "doc-file-2"]);
  await rm(context.source);
  const retained = await context.run();
  expect(retained.exitCode, retained.stderr).toBe(0);
  expect((await context.remote()).documents).toHaveLength(2);
  const deleteRefused = await context.run(["--delete"]);
  expect(deleteRefused.exitCode, deleteRefused.stderr).toBe(7);
  const deleted = await context.run(["--delete", "--yes"]);
  expect(deleted.exitCode, deleted.stderr).toBe(0);
  expect((await context.remote()).documents).toEqual([
    { doc_id: "sentinel", tags: [], status: "FINISH" },
  ]);
  expect((await context.remote()).files).toHaveLength(2);
});

test("an uncertain import preserves the checkpoint and original error without replay on retry", async () => {
  const context = await setup();
  const failed = await context.run([], "import");
  expect(failed.exitCode, failed.stderr).toBe(1);
  expect(failed.stderr).toContain("original import failure");
  expect(failed.stderr).toContain("KNOWLEDGE_SYNC_INCOMPLETE");
  const checkpoint = await context.checkpoint();
  expect(checkpoint).toContain('"registered"');
  const count = (await context.paths()).length;
  const retried = await context.run(["--yes"]);
  expect(retried.exitCode, retried.stderr).toBe(1);
  expect(await context.checkpoint()).toBe(checkpoint);
  for (const path of mutations) expect((await context.paths()).slice(count)).not.toContain(path);
});
