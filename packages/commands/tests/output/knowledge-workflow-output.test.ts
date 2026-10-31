import { INIT_SAMPLE } from "../../src/commands/knowledge/init-sample.ts";
import baseline from "./fixtures/knowledge-workflow-text.json" with { type: "json" };
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  ExitCode,
  buildSettings,
  Client,
  httpTransport,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter, CommandRegistry } from "bailian-cli-runtime";
import * as commands from "../../src/index.ts";
import * as workflow from "../../src/commands/knowledge/init-workflow.ts";
import * as execution from "../../src/commands/knowledge/sync/execute.ts";
import * as recovery from "../../src/commands/knowledge/sync/recovery-run.ts";
import { planSync } from "../../src/commands/knowledge/sync/plan.ts";
import { initCreatedResources } from "../e2e/knowledge/journeys/init-resource-records.ts";
const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const retained = { future: { values: [false, 0, null, []] } };
const response = {
  request_id: "search-request",
  ...retained,
  data: {
    total: 1,
    cost_time: 0,
    nodes: [
      {
        score: 0.25,
        text: "Body",
        metadata: { doc_name: "fixture", content: "Body", ...retained },
      },
    ],
  },
};
const resources = [
  { kind: "file" as const, id: "file-one", created: true },
  { kind: "knowledge-base" as const, id: "index-one", created: true },
  { kind: "service" as const, id: "service-one", created: false },
];
let directory: string, stateFile: string;
let failInit: boolean, failSync: boolean, failSearch: boolean, blocked: boolean, replan: boolean;
let requests: Array<{ path: string; body: unknown }>;
let searchResponse: unknown;
let initResult: Awaited<ReturnType<typeof workflow.runKnowledgeInit>>;
let checkpoint: Record<string, unknown>;
const original = new BailianError("original failure", ExitCode.NETWORK, "original hint");
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "knowledge-workflow-output-"));
  stateFile = join(directory, "state.json");
  failInit = false;
  failSync = false;
  failSearch = false;
  blocked = false;
  replan = false;
  requests = [];
  searchResponse = response;
  checkpoint = {
    schemaVersion: 1,
    syncId: "12345678-1234-4234-8234-123456789012",
    target: {
      endpointOrigin: "https://fixture.invalid",
      workspaceId: "ws-test",
      indexId: "index-one",
      categoryId: "category-one",
    },
    entries: {
      "a.md": {
        relativePath: "a.md",
        contentSha256: "a".repeat(64),
        contentMd5: "b".repeat(32),
        size: 0,
        mtimeMs: 0,
        fileId: "file-one",
        docId: "doc-one",
      },
    },
    pending: [
      {
        operationId: "op-one",
        relativePath: "a.md",
        action: "replace",
        phase: "submitted",
        fileId: "file-new",
        ingestionId: "job-one",
        oldDocId: "doc-one",
        newDocId: "doc-new",
      },
    ],
  };
  await writeFile(stateFile, JSON.stringify(checkpoint));
  initResult = {
    indexId: "index-one",
    agentId: "service-one",
    fileId: "file-one",
    agentVersion: "beta",
    sampleMatched: true,
    sampleSearch: {
      query: INIT_SAMPLE.query,
      response: {
        code: "Success",
        status_code: 200,
        request_id: "sample-request",
        data: {
          total: 1,
          cost_time: 0,
          nodes: [
            {
              score: 0.9,
              text: "BAILIAN_CLI_INIT_SAMPLE_V1 RAG means retrieval-augmented generation.",
              metadata: { doc_name: "fixture.md" },
            },
          ],
        },
      },
    },
    resources,
    stateFile,
    timeToFirstValueMs: 7,
  };
  vi.spyOn(workflow, "runKnowledgeInit").mockImplementation(async (options) => {
    resources.forEach(options.report);
    if (failInit) throw original;
    return initResult;
  });
  vi.spyOn(execution, "executeSyncPlan").mockImplementation(async () => {
    if (failSync) throw original;
    return { state: checkpoint, completed: [] } as never;
  });
  vi.spyOn(recovery, "runSyncRecovery").mockImplementation(
    async () => ({ state: checkpoint, completed: [], requiresReplan: true }) as never,
  );
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, options) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    requests.push({
      path: url.pathname,
      body: typeof options?.body === "string" ? JSON.parse(options.body) : undefined,
    });
    return failSearch
      ? Response.json(
          { message: "raw search failure", request_id: "request-failed" },
          { status: 400 },
        )
      : Response.json(searchResponse);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
interface Display {
  format: "json" | "text";
  quiet?: boolean;
  verbose?: boolean;
  language?: "en-US" | "zh-CN";
  binName?: "bl" | "kscli";
}
async function invoke(name: "search" | "init" | "sync", display: Display) {
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "";
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    strayOut += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    strayErr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: { output: display.format, quiet: display.quiet, verbose: display.verbose },
    file: { language: display.language ?? "en-US", workspace_id: "ws-test" },
    env: {},
    configPath: join(directory, "config.json"),
  });
  const localize = (text: LocalizedText) =>
    typeof text === "string" ? text : text[display.language ?? "en-US"];
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://fixture.invalid",
    apiCred: { token: "fixture-api-token", source: "flag", baseUrl: "https://fixture.invalid" },
    debug: (record) => reporter.output.debug(record),
  });
  const binName = display.binName ?? "bl";
  const registry = new CommandRegistry(
    binName === "bl"
      ? {
          "knowledge delete": commands.knowledgeKbDelete,
          "knowledge service delete": commands.knowledgeServiceDelete,
          "knowledge file delete": commands.knowledgeFileDelete,
          "knowledge search": commands.knowledgeSearch,
        }
      : {
          "kb delete": commands.knowledgeKbDelete,
          "service delete": commands.knowledgeServiceDelete,
          "file delete": commands.knowledgeFileDelete,
          search: commands.knowledgeSearch,
        },
    binName,
  );
  const plan = planSync({ local: [], managed: [], deleteEnabled: false });
  plan.blocked = blocked;
  plan.requiresReplan = replan;
  const prepared =
    name === "init"
      ? { stateFile, state: { target: { workspaceId: "ws-test" } } }
      : {
          stateFile,
          stateRevision: null,
          state: checkpoint,
          target: checkpoint.target,
          scan: { files: [] },
          remote: {},
          plan,
          orphans: [],
          notices: [],
        };
  const command =
    name === "search"
      ? commands.knowledgeSearch
      : name === "init"
        ? commands.knowledgeInit
        : commands.knowledgeDocSync;
  const flags =
    name === "search"
      ? {
          workspaceId: "ws-test",
          agentId: "service-one",
          query: "Question",
          image: ["https://media.invalid/image"],
          agentVersion: "beta",
        }
      : { workspaceId: "ws-test", indexId: "index-one", dir: directory };
  let exitCode = 0;
  try {
    try {
      await command.run({
        identity: { ...identity, binName },
        settings,
        flags,
        prepared,
        client,
        localize,
        output: reporter.output,
        commandPath: registry.commandPath.bind(registry),
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, strayOut, strayErr, exitCode };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}
const diagnostics = (stderr: string) =>
  stderr.trim()
    ? stderr
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
const modes = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "text" | "json", quiet, verbose })),
  ),
);
for (const name of ["search", "init", "sync"] as const) {
  test.each(modes)(
    `${name} uses complete scoped results and parseable diagnostics: %j`,
    async (display) => {
      const result = await invoke(name, display);
      expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
      expect(result.strayOut + result.strayErr).toBe("");
      if (display.format === "json") {
        const data = JSON.parse(result.stdout);
        if (name === "search") expect(data).toEqual(response);
        else if (name === "init") expect(data).toMatchObject(initResult);
        else
          expect(data).toMatchObject({
            requiresReplan: false,
            stateFile,
            result: { state: checkpoint, completed: [] },
          });
        const records = diagnostics(result.stderr);
        expect(records.every((record) => record.warning || record.debug)).toBe(true);
        if (name === "init")
          expect(
            records.filter((record) => record.warning?.code === "KNOWLEDGE_INIT_RESOURCE"),
          ).toHaveLength(3);
      } else expect(result.stdout.replaceAll(stateFile, "<STATE_FILE>")).toBe(baseline[name]);
      expect(result.stdout + result.stderr).not.toContain("fixture-api-token");
    },
  );
  test.each(["en-US", "zh-CN"] as const)(`${name} localizes final text in %s`, async (language) => {
    const result = await invoke(name, { format: "text", quiet: true, language });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(result.stdout).toContain(
      name === "search"
        ? language === "zh-CN"
          ? "得分"
          : "score"
        : name === "init"
          ? language === "zh-CN"
            ? "初始化成功"
            : "Initialization succeeded"
          : language === "zh-CN"
            ? "同步完成"
            : "Synchronization completed",
    );
  });
}
test.each(["bl", "kscli"] as const)(
  "init %s retains product cleanup and next-search paths without reusing existing resources",
  async (binName) => {
    const result = await invoke("init", { format: "json", quiet: true, binName });
    expect(result.exitCode, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.cleanup.map((action: { path: string[] }) => action.path)).toEqual(
      binName === "bl"
        ? [
            ["knowledge", "delete"],
            ["knowledge", "file", "delete"],
          ]
        : [
            ["kb", "delete"],
            ["file", "delete"],
          ],
    );
    expect(data.nextSearch.path).toEqual(binName === "bl" ? ["knowledge", "search"] : ["search"]);
    expect(data.cleanup).toHaveLength(2);
  },
);
test.each([false, true])(
  "init failure retains created resources and cleanup warning with quiet=%s",
  async (quiet) => {
    failInit = true;
    const result = await invoke("init", { format: "json", quiet });
    expect(result.exitCode).toBe(ExitCode.NETWORK);
    expect(result.stdout).toBe("");
    expect(result.strayOut + result.strayErr).toBe("");
    const events = diagnostics(result.stderr);
    expect(events.filter((event) => event.error)).toHaveLength(1);
    expect(events.at(-1).error).toMatchObject({
      message: "original failure",
      hint: "original hint",
      code: ExitCode.NETWORK,
    });
    expect(events[1].warning.details).toMatchObject({
      resource: { kind: "knowledge-base", id: "index-one", created: true },
      cleanup: [
        {
          path: ["knowledge", "delete"],
          args: ["--index-id", "index-one", "--workspace-id", "ws-test"],
        },
      ],
    });
    expect(initCreatedResources(result.stdout, result.stderr)).toEqual(
      resources.filter((resource) => resource.created),
    );
  },
);
test.each([false, true])(
  "sync failure keeps the complete typed checkpoint and original error with quiet=%s",
  async (quiet) => {
    failSync = true;
    const result = await invoke("sync", { format: "json", quiet });
    expect(result.exitCode).toBe(ExitCode.NETWORK);
    expect(result.stdout).toBe("");
    expect(result.strayOut + result.strayErr).toBe("");
    const events = diagnostics(result.stderr);
    expect(events).toHaveLength(2);
    expect(events[0].warning).toMatchObject({
      code: "KNOWLEDGE_SYNC_INCOMPLETE",
      details: { stateFile, checkpoint },
    });
    expect(events[0].warning.details.checkpoint).toEqual(checkpoint);
    expect(events[1].error).toMatchObject({
      message: "original failure",
      hint: "original hint",
      code: ExitCode.NETWORK,
    });
  },
);
test("unreadable sync checkpoint never replaces the original failure", async () => {
  failSync = true;
  await writeFile(stateFile, "{broken");
  const result = await invoke("sync", { format: "json", quiet: true });
  expect(result.exitCode).toBe(ExitCode.NETWORK);
  const events = diagnostics(result.stderr);
  expect(events[0].warning.details.stateFile).toBe(stateFile);
  expect(events[0].warning.details).not.toHaveProperty("checkpoint");
  expect(events[1].error.message).toBe("original failure");
});
test("blocked sync plan aborts before any execution", async () => {
  blocked = true;
  const result = await invoke("sync", { format: "json", quiet: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(execution.executeSyncPlan).not.toHaveBeenCalled();
  expect(recovery.runSyncRecovery).not.toHaveBeenCalled();
});
test("recovery sync never runs the ordinary plan in the same invocation", async () => {
  replan = true;
  const result = await invoke("sync", { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).requiresReplan).toBe(true);
  expect(recovery.runSyncRecovery).toHaveBeenCalledOnce();
  expect(execution.executeSyncPlan).not.toHaveBeenCalled();
});
test("search request preserves images and draft version", async () => {
  const result = await invoke("search", { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(requests).toHaveLength(1);
  expect(requests[0].body).toEqual({
    query: "Question",
    agent_id: "service-one",
    agent_version: "beta",
    images: ["https://media.invalid/image"],
  });
  expect(JSON.parse(result.stdout)).toEqual(response);
});
test("JSON search does not evaluate score.toFixed", async () => {
  searchResponse = { ...response, data: { nodes: [{ score: null, text: "Body", ...retained }] } };
  const result = await invoke("search", { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(searchResponse);
});
test("empty search keeps full metadata with quiet JSON", async () => {
  searchResponse = { ...response, data: { nodes: [], total: 0 } };
  const result = await invoke("search", { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(searchResponse);
});
test("search service failure still has one original terminal error", async () => {
  failSearch = true;
  const result = await invoke("search", { format: "json", quiet: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)).toHaveLength(1);
  expect(diagnostics(result.stderr)[0].error.message).toBe("raw search failure");
});
