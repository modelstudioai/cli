import {
  readUploadedFileIds,
  readImportedFileIds,
  readDocumentIds,
  readChunkIds,
  readIngestionStatus,
} from "../e2e/knowledge/document-response.ts";
import { stripVTControlCharacters } from "node:util";
import { mkdtemp, mkdir, rm, writeFile, open } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  ExitCode,
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "bailian-cli-commands";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const extra = { future: { retained: [false, 0, null, []] } };
const docs = {
  request_id: "request-docs",
  ...extra,
  data: {
    total_count: 0,
    rows: [
      {
        doc_id: "doc-one",
        status: "FAILED",
        doc_name: "a.md",
        doc_type: "md",
        size: 0,
        chunkSize: 0,
        overlapSize: 0,
        separator: null,
        chunkMode: "length",
        enableHeaders: false,
      },
    ],
  },
};
const status = {
  request_id: "request-status",
  ...extra,
  data: {
    ingestion_status: "COMPLETED",
    total_count: 1,
    rows: [{ doc_id: "doc-one", code: "SUCCESS", doc_name: "a.md" }],
  },
};
const deleted = { request_id: "request-delete", ...extra, data: { deleted: ["doc-one"] } };
const mutation = { request_id: "request-mutation", ...extra, data: { success: true } };
const imported = { request_id: "request-import", ...extra, data: { ingestionId: "job-one" } };
const oss = {
  request_id: "request-oss",
  ...extra,
  data: {
    addFileResultList: [
      { fileId: "file-one", status: "SUCCESS", ossKey: "a.pdf" },
      { status: "FAILED", ossKey: "broken.pdf", message: "original row failure" },
    ],
  },
};
const chunks = {
  request_id: "request-chunks",
  ...extra,
  data: {
    total: 0,
    nodes: [
      {
        text: "Fallback",
        metadata: {
          _id: "chunk-one",
          doc_id: "doc-one",
          doc_name: "a.md",
          _chunk_status_message: "READY",
          is_displayed_chunk_content: false,
          content: "Body",
          clip_start_time: 0,
          clip_end_time: 1000,
          clip_description: "Caption",
          video_url: "https://media.invalid/one",
          audio_segments: [{ speaker: 0, text: "Audio", retained: false }],
        },
      },
    ],
  },
};
let directory: string;
let requests: Array<{ path: string; method: string; body?: unknown; authorization: string | null }>;
let puts: string[];
let replies: Map<string, unknown>;
let failPath: string | undefined;
let failAt: number;
let timeout: boolean;
let leaseCount: number;
let registerCount: number;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "knowledge-doc-chunk-"));
  await writeFile(join(directory, "a.md"), "hello");
  await writeFile(join(directory, "b.txt"), "world");
  await mkdir(join(directory, "scan"));
  await writeFile(join(directory, "scan", "a.md"), "hello");
  await writeFile(join(directory, "scan", "skip.bin"), "skip");
  requests = [];
  puts = [];
  leaseCount = 0;
  registerCount = 0;
  failPath = undefined;
  failAt = 1;
  timeout = false;
  replies = new Map<string, unknown>([
    ["/api/v1/indices/rag/index/files", docs],
    ["/api/v1/indices/rag/list/index/file/details", docs],
    ["/api/v1/indices/rag/index_job/status", status],
    ["/api/v1/indices/rag/index/delete_file", deleted],
    ["/api/v1/indices/rag/index/job/create", imported],
    ["/api/v1/connector/dash/batchUpdateFileTag", mutation],
    ["/api/v1/connector/dash/addFilesFromAuthorizedOss", oss],
    ["/api/v1/indices/rag/index/chunklist", chunks],
    ["/api/v1/indices/rag/index/chunk/create", mutation],
    ["/api/v1/indices/rag/index/chunk/update", mutation],
    ["/api/v1/indices/rag/index/chunk/delete", mutation],
  ]);
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const authorization = new Headers(init?.headers).get("authorization");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({
      path: url.pathname + url.search,
      method: init?.method ?? "GET",
      body,
      authorization,
    });
    if (
      url.pathname === failPath &&
      requests.filter((request) => request.path.split("?")[0] === failPath).length === failAt
    ) {
      if (timeout) throw new BailianError("original deadline", ExitCode.TIMEOUT);
      return Response.json(
        { code: "Rejected", message: "original service error", request_id: "request-error" },
        { status: 403 },
      );
    }
    if (url.hostname === "oss.fixture.invalid") {
      const content: Buffer[] = [];
      for await (const chunk of init!.body as unknown as AsyncIterable<Uint8Array>)
        content.push(Buffer.from(chunk));
      puts.push(Buffer.concat(content).toString());
      return new Response("");
    }
    if (url.pathname.endsWith("/applyFileUploadLease")) {
      leaseCount++;
      return Response.json({
        data: {
          leaseId: `lease-${leaseCount}`,
          param: {
            url: `https://oss.fixture.invalid/upload/${leaseCount}`,
            method: "PUT",
            headers: { "x-fixture": "signed" },
          },
        },
      });
    }
    if (url.pathname.endsWith("/addFile")) {
      registerCount++;
      return Response.json({ data: { fileId: registerCount === 1 ? "file-one" : "file-two" } });
    }
    if (!replies.has(url.pathname)) throw new Error(`Unexpected request: ${url.pathname}`);
    return Response.json(replies.get(url.pathname));
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: () => Record<string, unknown>;
  want: () => unknown;
  text: () => string;
  chinese: string;
}
const cases: Scenario[] = [
  {
    name: "doc list",
    command: commands.knowledgeDocList,
    flags: () => ({ indexId: "index-one" }),
    want: () => docs,
    text: () => "doc-one  FAILED  a.md  md  0\ntotal: 0\n",
    chinese: "总数",
  },
  {
    name: "doc status",
    command: commands.knowledgeDocStatus,
    flags: () => ({ indexId: "index-one", jobId: "job-one" }),
    want: () => status,
    text: () => "status: COMPLETED\n  doc-one  SUCCESS  a.md\n",
    chinese: "状态",
  },
  {
    name: "doc upload",
    command: commands.knowledgeDocUpload,
    flags: () => ({ file: [join(directory, "a.md")] }),
    want: () => ({ files: [{ path: join(directory, "a.md"), fileId: "file-one" }], skipped: [] }),
    text: () => "a.md  file-one  registered\n\nUploaded 1 file.\n",
    chinese: "上传",
  },
  {
    name: "doc delete",
    command: commands.knowledgeDocDelete,
    flags: () => ({ indexId: "index-one", docId: ["doc-one"] }),
    want: () => deleted,
    text: () => "deleted: 1 document(s)\n  doc-one\n",
    chinese: "删除",
  },
  {
    name: "doc tag",
    command: commands.knowledgeDocTag,
    flags: () => ({ docId: ["file-one"], tag: ["team"] }),
    want: () => mutation,
    text: () => "tagged: 1 file(s) with [team]\n",
    chinese: "标签",
  },
  {
    name: "doc import",
    command: commands.knowledgeDocImport,
    flags: () => ({
      indexId: "index-one",
      docId: ["file-one"],
      overlapSize: 0,
      enableHeaders: false,
    }),
    want: () => imported,
    text: () => "ingestionId: job-one\n",
    chinese: "导入任务",
  },
  {
    name: "doc import-oss",
    command: commands.knowledgeDocImportOss,
    flags: () => ({
      bucket: "fixture-bucket",
      region: "cn-beijing",
      ossKey: ["a.pdf", "broken.pdf"],
    }),
    want: () => oss,
    text: () => "imported: 1 file(s)\n  file-one  SUCCESS  a.pdf\n  -  FAILED  broken.pdf\n",
    chinese: "导入",
  },
  {
    name: "chunk add",
    command: commands.knowledgeChunkAdd,
    flags: () => ({ indexId: "index-one", docId: "doc-one", content: "Chunk body text" }),
    want: () => mutation,
    text: () => "chunk created (pipeline: index-one)\nList chunks to find the new chunk id.\n",
    chinese: "创建",
  },
  {
    name: "chunk list",
    command: commands.knowledgeChunkList,
    flags: () => ({ indexId: "index-one", docId: "doc-one" }),
    want: () => chunks,
    text: () =>
      '[chunk] chunk-one  (doc: a.md, doc_id: doc-one)  status: READY  [excluded from retrieval]\n  Body\n  clip: 00:00.000–00:01.000\n  clip_description: Caption\n  video_url: https://media.invalid/one\n  audio_segment: {"speaker":0,"text":"Audio","retained":false}\ntotal: 0\n',
    chinese: "总数",
  },
  {
    name: "chunk update",
    command: commands.knowledgeChunkUpdate,
    flags: () => ({ indexId: "index-one", chunkId: "chunk-one", title: "", exclude: true }),
    want: () => mutation,
    text: () => "updated: chunk-one\n",
    chinese: "更新",
  },
  {
    name: "chunk delete",
    command: commands.knowledgeChunkDelete,
    flags: () => ({ indexId: "index-one", chunkId: ["chunk-one"] }),
    want: () => ({ deleted_count: 1, batches: 1 }),
    text: () => "deleted: 1 chunk(s) in 1 batch(es)\n",
    chinese: "删除",
  },
];
interface Display {
  format: "json" | "text";
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  language?: "en-US" | "zh-CN";
}
async function invoke(scenario: Scenario, display: Display, flags = scenario.flags()) {
  let stdout = "",
    stderr = "";
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
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
    apiCred: { token: "fixture-api-key", source: "flag", baseUrl: "https://fixture.invalid" },
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        identity,
        settings,
        client,
        localize,
        output: reporter.output,
        flags,
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, exitCode };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}
const modes = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
function diagnostics(stderr: string) {
  return stderr.trim()
    ? stderr
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}
for (const scenario of cases) {
  test.each(modes)(`${scenario.name} preserves complete results: %j`, async (display) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json") {
      expect(JSON.parse(result.stdout)).toEqual(scenario.want());
      expect(diagnostics(result.stderr).every((record) => record.debug !== undefined)).toBe(true);
    } else expect(result.stdout).toBe(scenario.text());
    expect(result.stdout + result.stderr).not.toContain("fixture-api-key");
    if (scenario.command === commands.knowledgeChunkUpdate) {
      expect(requests.map((request) => request.path)).toEqual([
        "/api/v1/indices/rag/index/chunklist",
        "/api/v1/indices/rag/index/chunk/update",
      ]);
      expect(requests.at(-1)!.body).toEqual({
        pipelineId: "index-one",
        chunkId: "chunk-one",
        content: "Body",
        isDisplayedChunkContent: false,
        title: "",
      });
    }
    if (scenario.command === commands.knowledgeDocUpload) {
      expect(puts).toEqual(["hello"]);
      expect(requests.map((request) => [request.method, request.path])).toEqual([
        ["POST", "/api/v1/connector/dash/applyFileUploadLease"],
        ["PUT", "/upload/1"],
        ["POST", "/api/v1/connector/dash/addFile"],
      ]);
      expect(requests[0]!.body).toMatchObject({
        category: "default",
        fileName: "a.md",
        sizeBytes: "5",
        contentMd5: "XUFAKrxLKna5cZ2REBfFkg==",
      });
      expect(requests[1]!.authorization).toBeNull();
    }
  });
  test(`${scenario.name} Chinese text and dry-run JSON preserve the contract`, async () => {
    const text = await invoke(scenario, { format: "text", quiet: true, language: "zh-CN" });
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.stdout).toContain(scenario.chinese);
    requests = [];
    const preview = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
    expect(preview.exitCode, preview.stderr).toBe(0);
    const data = JSON.parse(preview.stdout);
    expect(data.endpoint ?? data.steps?.[0]?.endpoint).toContain(
      "https://ws-test.cn-beijing.maas.aliyuncs.com/",
    );
    expect(requests).toEqual([]);
  });
}
test.each(modes)("detailed document page preserves false/0/null settings: %j", async (display) => {
  const result = await invoke(cases[0]!, display, {
    indexId: "index-one",
    details: true,
    pageNumber: 2,
    pageSize: 3,
  });
  expect(result.exitCode, result.stderr).toBe(0);
  if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(docs);
  else
    expect(result.stdout).toBe(
      'doc-one  FAILED  a.md  md  0\n  chunkSize: 0\n  overlapSize: 0\n  separator: -\n  chunkMode: "length"\n  enableHeaders: false\ntotal: 0\n',
    );
  expect(requests[0]).toMatchObject({
    method: "POST",
    path: "/api/v1/indices/rag/list/index/file/details",
    body: { indexId: "index-one", pageNumber: 2, pageSize: 3 },
  });
});
test.each(modes)("empty document/chunk pages retain metadata and text: %j", async (display) => {
  for (const [index, path, response, text] of [
    [
      0,
      "/api/v1/indices/rag/index/files",
      { request_id: "empty-doc", data: { rows: [], total_count: 0 } },
      "No documents found.\ntotal: 0\n",
    ],
    [
      8,
      "/api/v1/indices/rag/index/chunklist",
      { request_id: "empty-chunk", data: { nodes: [], total: 0 } },
      "No chunks found.\ntotal: 0\n",
    ],
  ] as const) {
    replies.set(path, response);
    const result = await invoke(cases[index]!, display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(response);
    else expect(result.stdout).toBe(text);
  }
});
test.each(["en-US", "zh-CN"] as const)(
  "upload size warning is JSONL under JSON quiet dry-run (%s)",
  async (language) => {
    const file = join(directory, "large.csv");
    const handle = await open(file, "w");
    try {
      await handle.truncate(10 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }
    const result = await invoke(
      cases[2]!,
      { format: "json", quiet: true, dryRun: true, language },
      { file: [file] },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).steps).toHaveLength(3);
    expect(diagnostics(result.stderr)[0].warning).toMatchObject({
      code: "KNOWLEDGE_UPLOAD_SIZE_WARNING",
      details: { file, size_bytes: 10 * 1024 * 1024 + 1 },
    });
    if (language === "zh-CN") expect(result.stderr).toContain("建议");
    expect(requests).toEqual([]);
  },
);
test.each([false, true])(
  "partial document deletion retains raw result and warns with quiet=%s",
  async (quiet) => {
    const result = await invoke(
      cases[3]!,
      { format: "json", quiet },
      { indexId: "index-one", docId: ["doc-one", "doc-two"] },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(deleted);
    expect(diagnostics(result.stderr)[0].warning).toMatchObject({
      code: "KNOWLEDGE_DOC_DELETE_PARTIAL",
      details: { requested_count: 2, deleted_count: 1 },
    });
  },
);
test.each([false, true])("text warnings preserve existing lines with quiet=%s", async (quiet) => {
  const deletion = await invoke(
    cases[3]!,
    { format: "text", quiet },
    { indexId: "index-one", docId: ["doc-one", "doc-two"] },
  );
  expect(deletion.exitCode, deletion.stderr).toBe(0);
  expect(deletion.stderr).toBe("Warning: requested 2 deletion(s) but the server reported 1.\n");
  const file = join(directory, "large.csv");
  const handle = await open(file, "w");
  try {
    await handle.truncate(10 * 1024 * 1024 + 1);
  } finally {
    await handle.close();
  }
  const upload = await invoke(cases[2]!, { format: "text", quiet, dryRun: true }, { file: [file] });
  expect(upload.exitCode, upload.stderr).toBe(0);
  expect(upload.stderr).toBe(
    "Warning: large.csv exceeds the recommended 10 MB for .csv; the server may reject or truncate it.\n",
  );
});
test.each(modes)(
  "upload directory keeps skipped-file and verbose result layout: %j",
  async (display) => {
    const result = await invoke(cases[2]!, display, { file: [join(directory, "scan")] });
    expect(result.exitCode, result.stderr).toBe(0);
    const skipped = join(directory, "scan", "skip.bin");
    if (display.format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        files: [{ path: join(directory, "scan", "a.md"), fileId: "file-one" }],
        skipped: [skipped],
      });
    else
      expect(result.stdout).toBe(
        "a.md  file-one  registered\n\nUploaded 1 file, skipped 1 unsupported.\n" +
          (display.verbose ? "Skipped files:\n  skip.bin\n" : ""),
      );
  },
);
test.each([1, 2, 5])(
  "wait command %s preserves the job response without JSON progress",
  async (index) => {
    const flags =
      index === 2
        ? { file: [join(directory, "a.md")], indexId: "index-one", wait: true }
        : { ...cases[index]!.flags(), wait: true };
    const result = await invoke(cases[index]!, { format: "json", quiet: true }, flags);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    const response = JSON.parse(result.stdout);
    if (index === 1) expect(response).toEqual(status);
    else if (index === 2)
      expect(response).toEqual({
        files: [{ path: join(directory, "a.md"), fileId: "file-one" }],
        skipped: [],
        index_id: "index-one",
        ingestion_id: "job-one",
        final_status: "COMPLETED",
      });
    else expect(response).toEqual({ ...imported, status });
    expect(
      requests.filter((request) => request.path.startsWith("/api/v1/indices/rag/index_job/status")),
    ).toHaveLength(1);
  },
);
test("doc status keeps failure-before-result behavior and raw server text", async () => {
  replies.set("/api/v1/indices/rag/index_job/status", {
    data: {
      ingestion_status: "COMPLETED",
      rows: [{ doc_id: "doc-one", code: "PARSE_FAILED", message: "original parse failure" }],
    },
  });
  const result = await invoke(cases[1]!, { format: "json", quiet: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)[0].error.message).toContain("original parse failure");
});
test.each([2, 5])(
  "failed import wait %s keeps recovery IDs and timeout code without retry",
  async (index) => {
    failPath = "/api/v1/indices/rag/index_job/status";
    timeout = true;
    const flags =
      index === 2
        ? { file: [join(directory, "a.md")], indexId: "index-one", wait: true }
        : { ...cases[index]!.flags(), wait: true };
    const result = await invoke(cases[index]!, { format: "json", quiet: true }, flags);
    expect(result.exitCode).toBe(5);
    expect(result.stdout).toBe("");
    const error = diagnostics(result.stderr).at(-1).error;
    expect(error.hint).toContain("job-one");
    if (index === 2) expect(error.hint).toContain("file-one");
    expect(requests.filter((request) => request.path.startsWith(failPath!))).toHaveLength(1);
  },
);
test("later upload failure retains registered file ID and does not import", async () => {
  failPath = "/api/v1/connector/dash/applyFileUploadLease";
  failAt = 2;
  const result = await invoke(
    cases[2]!,
    { format: "json", quiet: true },
    { file: [join(directory, "a.md"), join(directory, "b.txt")], indexId: "index-one" },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)[0].error.hint).toContain("file-one");
  expect(puts).toEqual(["hello"]);
  expect(requests.some((request) => request.path.includes("/index/job/create"))).toBe(false);
});
test("chunk deletion batches preserve order and uncertain failure details", async () => {
  failPath = "/api/v1/indices/rag/index/chunk/delete";
  failAt = 3;
  const ids = Array.from({ length: 35 }, (_, position) => `chunk-${position}`);
  const result = await invoke(
    cases[10]!,
    { format: "json", quiet: true },
    { indexId: "index-one", chunkId: ids },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(requests.map((request) => (request.body as { chunkIds: string[] }).chunkIds)).toEqual([
    ids.slice(0, 10),
    ids.slice(10, 20),
    ids.slice(20, 30),
  ]);
  const error = diagnostics(result.stderr)[0].error;
  expect(error).toMatchObject({
    message: "original service error",
    request_id: "request-error",
    http_status: 403,
  });
  expect(error.hint).toContain("20 chunk(s) in 2 completed batch(es)");
  expect(error.hint).toContain("Batch 3 failed; its deletion outcome is unconfirmed.");
});

test("TTY document highlighting/truncation keeps reset before LF and JSON uncolored", async () => {
  const terminal = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const columns = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  const previousNoColor = process.env.NO_COLOR;
  try {
    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: 24 });
    const text = await invoke(cases[0]!, { format: "text", quiet: true });
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.stdout).toContain("\x1b[31m");
    expect(text.stdout).toContain("\x1b[0m\n");
    expect(stripVTControlCharacters(text.stdout).split("\n")[0]).toHaveLength(24);
    const json = await invoke(cases[0]!, { format: "json", quiet: true });
    expect(JSON.parse(json.stdout)).toEqual(docs);
    expect(json.stdout).not.toContain("\x1b");
  } finally {
    if (terminal) Object.defineProperty(process.stdout, "isTTY", terminal);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
    if (columns) Object.defineProperty(process.stdout, "columns", columns);
    else delete (process.stdout as { columns?: number }).columns;
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
  }
});

const consumers = [
  { index: 2, reader: readUploadedFileIds, want: ["file-one"], action: "import" },
  { index: 6, reader: readImportedFileIds, want: ["file-one"], action: "import" },
  { index: 0, reader: readDocumentIds, want: ["doc-one"], action: "delete-doc" },
  { index: 8, reader: readChunkIds, want: ["chunk-one"], action: "delete-chunk" },
  { index: 1, reader: readIngestionStatus, want: "COMPLETED", action: "status" },
];
test.each(consumers)(
  "test/Journey consumer $index reads full quiet JSON for subsequent requests",
  async ({ index, reader, want, action }) => {
    const result = await invoke(cases[index]!, { format: "json", quiet: true });
    expect(result.exitCode, result.stderr).toBe(0);
    const value = reader(result.stdout);
    expect(value).toEqual(want);
    if (action === "status") return;
    expect(Array.isArray(value)).toBe(true);
    if (action === "import") {
      const next = await invoke(
        cases[5]!,
        { format: "json", quiet: true },
        { indexId: "index-one", docId: value },
      );
      expect(next.exitCode, next.stderr).toBe(0);
      expect(requests.at(-1)!.body).toEqual({
        indexId: "index-one",
        sourceType: "DATA_CENTER_FILE",
        docIds: ["file-one"],
      });
    } else if (action === "delete-doc") {
      const next = await invoke(
        cases[3]!,
        { format: "json", quiet: true },
        { indexId: "index-one", docId: value },
      );
      expect(next.exitCode, next.stderr).toBe(0);
      expect(requests.at(-1)!.body).toEqual({ index_id: "index-one", doc_ids: ["doc-one"] });
    } else {
      const next = await invoke(
        cases[10]!,
        { format: "json", quiet: true },
        { indexId: "index-one", chunkId: value },
      );
      expect(next.exitCode, next.stderr).toBe(0);
      expect(requests.at(-1)!.body).toEqual({ pipelineId: "index-one", chunkIds: ["chunk-one"] });
    }
  },
);
