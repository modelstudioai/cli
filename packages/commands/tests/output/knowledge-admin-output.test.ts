import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  buildSettings,
  ExitCode,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "bailian-cli-commands";

const now = Date.parse("2026-10-01T00:00:00Z");
const row = {
  id: "idx-test",
  name: "Demo",
  description: "Team docs",
  embeddingModelName: "text-embedding-v4",
  chunkSize: 600,
  enableRewrite: false,
  rerankMinScore: 0,
  connectorId: "conn-test",
};
const created = {
  request_id: "request-create",
  data: { pipelineId: "idx-test", ingestionId: "job-test" },
};
const mutation = { request_id: "request-mutation", data: { success: true } };
const categories = {
  request_id: "request-category",
  data: {
    categoryList: [{ categoryId: "cate-test", categoryName: "Docs", isDefault: true }],
    nextToken: "next-category",
  },
};
const file = {
  fileId: "file-test",
  fileName: "a.md",
  fileType: "md",
  sizeBytes: 0,
  status: "READY",
  parser: "default",
  category: "cate-test",
  tags: ["docs", "team"],
};
const collection = { connectorId: "conn-test", connectorName: "Demo", description: "Team docs" };
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  response: Record<string, unknown>;
  want: unknown;
  text: string;
}
const cases: Scenario[] = [
  {
    name: "knowledge create",
    command: commands.knowledgeKbCreate,
    flags: { name: "Demo", description: "Team docs", docId: ["file-test"] },
    response: created,
    want: created,
    text: "index_id: idx-test",
  },
  {
    name: "knowledge list",
    command: commands.knowledgeKbList,
    flags: { name: "Demo", pageNumber: 2, pageSize: 3 },
    response: { request_id: "request-list", data: { rows: [row], total: 7 } },
    want: { request_id: "request-list", data: { rows: [row], total: 7 } },
    text: "total: 7",
  },
  {
    name: "knowledge info",
    command: commands.knowledgeKbInfo,
    flags: { indexId: "idx-test" },
    response: { request_id: "request-info", data: { rows: [row] } },
    want: row,
    text: "Retrieval:",
  },
  {
    name: "knowledge update",
    command: commands.knowledgeKbUpdate,
    flags: { indexId: "idx-test", description: "", rerankMinScore: 0 },
    response: mutation,
    want: mutation,
    text: "updated: idx-test",
  },
  {
    name: "knowledge delete",
    command: commands.knowledgeKbDelete,
    flags: { indexId: "idx-test" },
    response: mutation,
    want: mutation,
    text: "deleted: idx-test",
  },
  {
    name: "knowledge stats",
    command: commands.knowledgeKbStats,
    flags: { indexId: "idx-test" },
    response: {
      request_id: "request-stats",
      data: {
        pipelineCommercialType: "FREE",
        storageMonitorData: { indexStorageUsage: 0, indexStorageLimit: 100 },
        qpsMonitorData: { peakQps: 0, monitorData: [] },
      },
    },
    want: {
      request_id: "request-stats",
      data: {
        pipelineCommercialType: "FREE",
        storageMonitorData: { indexStorageUsage: 0, indexStorageLimit: 100 },
        qpsMonitorData: { peakQps: 0, monitorData: [] },
      },
    },
    text: "storage: 0 / 100",
  },
  {
    name: "knowledge category list",
    command: commands.knowledgeCategoryList,
    flags: {
      collectionId: "conn-test",
      parentId: "parent-test",
      name: "Docs",
      nextToken: "cursor-in",
      maxResult: 0,
    },
    response: categories,
    want: categories,
    text: "next: --next-token next-category",
  },
  {
    name: "knowledge category add",
    command: commands.knowledgeCategoryAdd,
    flags: { name: "Docs", collectionId: "conn-test", parentId: "parent-test" },
    response: { request_id: "request-category", data: { categoryId: "cate-test" } },
    want: { request_id: "request-category", data: { categoryId: "cate-test" } },
    text: "created: cate-test  (Docs)",
  },
  {
    name: "knowledge category delete",
    command: commands.knowledgeCategoryDelete,
    flags: { categoryId: "cate-test" },
    response: mutation,
    want: mutation,
    text: "deleted: cate-test",
  },
  {
    name: "knowledge file list",
    command: commands.knowledgeFileList,
    flags: {
      categoryId: "cate-test",
      name: "a",
      fileId: ["file-test", "file-other"],
      nextToken: "cursor-in",
      maxResult: 0,
    },
    response: { request_id: "request-file", data: { fileList: [file], nextToken: "next-file" } },
    want: { request_id: "request-file", data: { fileList: [file], nextToken: "next-file" } },
    text: "next: --next-token next-file",
  },
  {
    name: "knowledge file get",
    command: commands.knowledgeFileGet,
    flags: { fileId: "file-test" },
    response: { request_id: "request-file", data: file },
    want: { request_id: "request-file", data: file },
    text: "tags: docs, team",
  },
  {
    name: "knowledge file delete",
    command: commands.knowledgeFileDelete,
    flags: { fileId: "file-test" },
    response: mutation,
    want: mutation,
    text: "deleted: file-test",
  },
  {
    name: "knowledge collection create",
    command: commands.knowledgeCollectionCreate,
    flags: {
      name: "Demo",
      description: "Team docs",
      storeType: "custom",
      ossRegion: "cn-beijing",
      ossBucket: "bucket-test",
    },
    response: { request_id: "request-collection", data: collection },
    want: { request_id: "request-collection", data: collection },
    text: "created: conn-test  (Demo, CUSTOM)",
  },
  {
    name: "knowledge collection get",
    command: commands.knowledgeCollectionGet,
    flags: { collectionId: "conn-test" },
    response: { request_id: "request-collection", data: collection },
    want: { request_id: "request-collection", data: collection },
    text: "description: Team docs",
  },
];
let requests: Array<{ path: string; method?: string; body?: unknown }> = [];
let failed = false;
let jobResponse: unknown = {
  request_id: "request-job",
  data: { ingestion_status: "COMPLETED", rows: [{ doc_id: "file-test", code: "FINISH" }] },
};
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(() => {
  vi.restoreAllMocks();
  requests = [];
  failed = false;
  jobResponse = {
    request_id: "request-job",
    data: { ingestion_status: "COMPLETED", rows: [{ doc_id: "file-test", code: "FINISH" }] },
  };
});
async function invoke(
  scenario: Scenario,
  display: {
    format: "text" | "json";
    quiet?: boolean;
    verbose?: boolean;
    dryRun?: boolean;
    workspace?: string;
  },
) {
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
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    file: { workspace_id: display.workspace ?? "ws-test" },
    env: {},
    configPath: "/tmp/knowledge-output/config.json",
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  });
  const client = {
    requestJson: async (options: { path: string; method?: string; body?: unknown }) => {
      requests.push(structuredClone(options));
      if (failed)
        throw new BailianError("Original knowledge service error", ExitCode.GENERAL, undefined, {
          api: { requestId: "request-error", apiCode: "Rejected" },
        });
      return structuredClone(
        options.path.includes("index_job/status") ? jobResponse : scenario.response,
      );
    },
  };
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        settings,
        flags: scenario.flags,
        client,
        output: reporter.output,
        localize,
        identity: { binName: "bl", version: "test", clientName: "test", npmPackage: "test" },
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
const matrix = cases.flatMap((scenario) =>
  (["text", "json"] as const).flatMap((format) =>
    [false, true].flatMap((quiet) =>
      [false, true].map((verbose) => ({ scenario, name: scenario.name, format, quiet, verbose })),
    ),
  ),
);
test.each(matrix)(
  "$name complete result: $format q=$quiet v=$verbose",
  async ({ scenario, ...display }) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(requests).toHaveLength(1);
    if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(scenario.want);
    else expect(result.stdout).toContain(scenario.text);
    expect(result.stderr).toBe("");
  },
);
test.each(cases)("$name dry-run is one JSON document and makes no requests", async (scenario) => {
  const result = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr + result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({ endpoint: expect.any(String) });
  expect(requests).toEqual([]);
});
test.each(cases)("$name preserves structured service errors", async (scenario) => {
  failed = true;
  const result = await invoke(scenario, { format: "json", quiet: true, verbose: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.strayOut + result.strayErr).toBe("");
  expect(JSON.parse(result.stderr).error).toMatchObject({
    message: "Original knowledge service error",
    request_id: "request-error",
    api_code: "Rejected",
  });
});
test.each([false, true])(
  "create --wait preserves final status and request order, quiet=%s",
  async (quiet) => {
    const result = await invoke(
      { ...cases[0]!, flags: { ...cases[0]!.flags, wait: true } },
      { format: "json", quiet },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr + result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ ...created, final_status: "COMPLETED" });
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]!.path).searchParams.get("index_id")).toBe("idx-test");
    expect(new URL(requests[1]!.path).searchParams.get("job_id")).toBe("job-test");
  },
);
test("create --wait document failure preserves the service detail and created-index hint", async () => {
  jobResponse = {
    request_id: "request-job",
    data: {
      ingestion_status: "COMPLETED",
      rows: [{ doc_id: "file-test", code: "PARSE_FAILED", message: "Original parse failure" }],
    },
  };
  const result = await invoke(
    { ...cases[0]!, flags: { ...cases[0]!.flags, wait: true } },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.strayOut + result.strayErr).toBe("");
  expect(JSON.parse(result.stderr).error).toMatchObject({
    message: expect.stringContaining("Original parse failure"),
    hint: "Knowledge base created: idx-test",
    request_id: "request-job",
  });
});
test.each([false, true])(
  "clamped-end process note is on stderr and follows quiet=%s",
  async (quiet) => {
    const result = await invoke(
      { ...cases[5]!, flags: { indexId: "idx-test", end: "2099-01-01" } },
      { format: "text", quiet },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(result.stdout).not.toContain("clamped");
    expect(result.stderr).toBe(quiet ? "" : "note: end time was in the future, clamped to now.\n");
    expect(requests[0]!.body).toMatchObject({ endTimestamp: "1790812800" });
  },
);
test("list query, zero/empty update and collection custom storage payload remain unchanged", async () => {
  await invoke(cases[1]!, { format: "json", quiet: true });
  const listUrl = new URL(requests[0]!.path);
  expect(requests[0]!.method).toBe("GET");
  expect(requests[0]!.body).toBeUndefined();
  expect(Object.fromEntries(listUrl.searchParams)).toEqual({
    pipeline_name: "Demo",
    page_number: "2",
    page_size: "3",
  });
  requests = [];
  await invoke(cases[3]!, { format: "json", quiet: true });
  expect(requests[0]!.body).toEqual({ id: "idx-test", description: "", rerankMinScore: 0 });
  requests = [];
  await invoke(cases[12]!, { format: "json", quiet: true });
  expect(requests[0]!.body).toEqual({
    connectorType: "FILE",
    connectorName: "Demo",
    description: "Team docs",
    fileConnectorConfig: { storeType: "CUSTOM", regionId: "cn-beijing", bucketName: "bucket-test" },
  });
});

test.each([1, 6, 9])("empty list $0 keeps its response and pagination in JSON", async (index) => {
  const scenario = cases[index]!;
  const response = {
    request_id: "request-empty",
    data: { rows: [], categoryList: [], fileList: [], total: 0, nextToken: "next-empty" },
  };
  const result = await invoke({ ...scenario, response }, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(response);
});
test.each([10, 13])(
  "missing data in $0 keeps the text placeholders and raw JSON",
  async (index) => {
    const scenario = { ...cases[index]!, response: { request_id: "request-empty" } };
    const text = await invoke(scenario, { format: "text", quiet: true });
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.strayOut + text.strayErr).toBe("");
    expect(text.stdout).toContain("id: -");
    const json = await invoke(scenario, { format: "json", quiet: true });
    expect(json.exitCode, json.stderr).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({ request_id: "request-empty" });
  },
);
test("missing knowledge base details remain a terminal failure without a partial result", async () => {
  const result = await invoke(
    { ...cases[2]!, response: { data: { rows: [] } } },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.strayOut + result.strayErr).toBe("");
  expect(JSON.parse(result.stderr).error.message).toBe("Knowledge base not found: idx-test");
});
test.each([false, true])("waiting progress stays on stderr and follows quiet=%s", async (quiet) => {
  const result = await invoke(
    { ...cases[0]!, flags: { ...cases[0]!.flags, wait: true } },
    { format: "text", quiet },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr).toBe("");
  expect(result.stdout).toContain("status: COMPLETED");
  expect(result.stdout).not.toContain("Polling");
  if (quiet) expect(result.stderr).toBe("");
  else expect(result.stderr).toContain("Status: COMPLETED");
});
test.each([false, true])("JSON hides the clamped-end info under quiet=%s", async (quiet) => {
  const result = await invoke(
    { ...cases[5]!, flags: { indexId: "idx-test", end: "2099-01-01" } },
    { format: "json", quiet },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr + result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(cases[5]!.want);
});
test("text truncation stays terminal-only and never clips the JSON result", async () => {
  const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY"),
    columns = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  const longName = "A very long file name with useful trailing information.md";
  const scenario = {
    ...cases[9]!,
    response: { data: { fileList: [{ ...file, fileName: longName }] } },
  };
  try {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: 24 });
    const text = await invoke(scenario, { format: "text", quiet: true });
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.stdout.trimEnd()).toHaveLength(24);
    expect(text.stdout).toContain("…");
    const json = await invoke(scenario, { format: "json", quiet: true });
    expect(JSON.parse(json.stdout).data.fileList[0].fileName).toBe(longName);
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    const pipe = await invoke(scenario, { format: "text", quiet: true });
    expect(pipe.stdout).toContain(longName);
  } finally {
    if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    if (columns) Object.defineProperty(process.stdout, "columns", columns);
    else delete (process.stdout as { columns?: number }).columns;
  }
});
