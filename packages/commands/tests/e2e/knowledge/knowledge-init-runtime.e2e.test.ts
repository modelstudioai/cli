import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";
import { RAG_PATHS } from "bailian-cli-core";

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/knowledge-init-cli.ts",
);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "init-runtime-"));
  directories.push(directory);
  const stateFile = join(directory, "state/init.json");
  const run = (args: string[] = [], failure = "") =>
    runNodeMain(
      fixture,
      [
        "knowledge",
        "init",
        "--workspace-id",
        "ws-test",
        "--state-file",
        stateFile,
        "--api-key",
        "fake-test-key",
        "--output",
        "json",
        "--quiet",
        ...args,
      ],
      {
        cwd: directory,
        env: {
          INIT_TEST_DIRECTORY: directory,
          INIT_TEST_FAILURE: failure,
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
  return { directory, stateFile, run, paths };
}

test.each([{ args: ["--dry-run"] }, { args: [] }])(
  "init $args reads the plan without creating cloud resources or checkpoints",
  async ({ args }) => {
    const context = await setup();
    const result = await context.run(args);
    expect(result.exitCode, result.stderr).toBe(args.length ? 0 : 7);
    const payload = JSON.parse(args.length ? result.stdout : result.stderr);
    const plan = args.length ? payload : payload.error;
    expect(plan.notices[0]).toMatchObject({
      code: "KNOWLEDGE_BILLING",
      remainingAllowance: "unknown",
    });
    expect(plan.plan).toBeDefined();
    expect(await context.paths()).toEqual([RAG_PATHS.indexList, RAG_PATHS.agentList]);
    expect(existsSync(join(context.directory, "fake-remote.json"))).toBe(false);
    expect(existsSync(join(context.directory, "state"))).toBe(false);
  },
);

test("confirmed init uses the full runtime and reuses the same resources on a second run", async () => {
  const context = await setup();
  const first = await context.run(["--yes"]);
  expect(first.exitCode, first.stderr + first.stdout).toBe(0);
  const payload = JSON.parse(first.stdout);
  expect(payload).toMatchObject({
    indexId: "index-test",
    agentId: "agent-test",
    sampleMatched: true,
  });
  expect(payload.cleanup).toContainEqual({
    path: ["knowledge", "delete"],
    args: ["--index-id", "index-test", "--workspace-id", "ws-test"],
  });
  expect(JSON.parse(await readFile(context.stateFile, "utf8"))).toMatchObject({
    phase: "verified",
  });
  const firstRequests = await context.paths();
  const second = await context.run();
  expect(second.exitCode, second.stderr + second.stdout).toBe(0);
  const secondPayload = JSON.parse(second.stdout);
  expect(secondPayload.cleanup).toEqual([]);
  expect(secondPayload.resources.every((resource: { created: boolean }) => !resource.created)).toBe(
    true,
  );
  const laterPaths = (await context.paths()).slice(firstRequests.length);
  for (const path of [
    RAG_PATHS.applyFileUploadLease,
    RAG_PATHS.addFile,
    RAG_PATHS.indexCreateV2,
    RAG_PATHS.agentCreate,
    RAG_PATHS.agentUpdate,
  ])
    expect(laterPaths).not.toContain(path);
});

test("post-create failure retains billing diagnostics, cleanup paths and recovery checkpoint", async () => {
  const context = await setup();
  const result = await context.run(["--yes"], "service");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("original service creation failure");
  expect(result.stderr).toContain("index-test");
  expect(result.stderr).toContain("KNOWLEDGE_BILLING");
  expect(result.stderr).toContain('"knowledge","delete"');
  expect(JSON.parse(await readFile(context.stateFile, "utf8"))).toMatchObject({
    indexId: "index-test",
    pending: { action: "create-service" },
  });
  const checkpoint = await readFile(context.stateFile, "utf8");
  const requestCount = (await context.paths()).length;
  const retry = await context.run(["--yes"]);
  expect(retry.exitCode).toBe(1);
  expect(await readFile(context.stateFile, "utf8")).toBe(checkpoint);
  const retryPaths = (await context.paths()).slice(requestCount);
  for (const path of [
    RAG_PATHS.applyFileUploadLease,
    RAG_PATHS.addFile,
    RAG_PATHS.indexCreateV2,
    RAG_PATHS.agentCreate,
    RAG_PATHS.agentUpdate,
  ]) {
    expect(retryPaths).not.toContain(path);
  }
});
