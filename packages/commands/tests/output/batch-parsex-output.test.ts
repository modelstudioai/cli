import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "bailian-cli-commands";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const job = {
  id: "batch-one",
  status: "completed",
  input_file_id: "file-input",
  output_file_id: "file-output",
  error_file_id: "file-error",
  request_counts: { total: 2, completed: 1, failed: 1 },
  metadata: { ds_name: "Example" },
  errors: { data: [{ code: "RowFailed", message: "original task error" }] },
};
const listed = { data: [job], first_id: "batch-one", last_id: "batch-one", has_more: true };
const submitted = {
  request_id: "request-submit",
  data: { biz_id: "biz-one" },
  extra: { retained: true },
};
const parsed = {
  request_id: "request-result",
  data: { status: "success", layouts: [{ text: "Hello" }], fields: [{ value: "Title" }] },
};
const outputRecord =
  '{"custom_id":"001","response":{"status_code":200,"body":{"choices":[{"message":{"content":"hello"}}]}},"error":null}\n';
let directory: string;
let requests: Array<{ method: string; path: string; body?: unknown }>;
let failCreate: boolean;
let invalidCsv: boolean;
let unknownCsv: boolean;
let statuses: string[];
let parseStatus: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "batch-parsex-output-"));
  await writeFile(join(directory, "input.csv"), "custom_id,content\n001,hello\n");
  const row = {
    custom_id: "001",
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "qwen-plus",
      messages: [{ role: "user", content: "hello" }],
      extra_body: { enable_thinking: true },
    },
  };
  await writeFile(join(directory, "input.jsonl"), JSON.stringify(row) + "\n");
  requests = [];
  failCreate = false;
  invalidCsv = false;
  unknownCsv = false;
  statuses = ["completed"];
  parseStatus = "success";
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ method: init?.method ?? "GET", path: url.pathname + url.search, body });
    if (url.pathname.endsWith("/files") && init?.method === "POST")
      return Response.json({ id: "file-uploaded" });
    if (url.pathname.endsWith("/batches") && init?.method === "POST") {
      return failCreate
        ? Response.json(
            { code: "Rejected", message: "original create error", request_id: "request-error" },
            { status: 400 },
          )
        : Response.json({ ...job, status: "validating" });
    }
    if (url.pathname.endsWith("/cancel")) return Response.json({ ...job, status: "cancelling" });
    if (url.pathname.endsWith("/batches")) return Response.json(listed);
    if (url.pathname.endsWith("/batches/batch-one"))
      return Response.json({
        ...job,
        status: statuses.length > 1 ? statuses.shift() : statuses[0],
      });
    if (url.pathname.endsWith("/files/file-output/content"))
      return new Response(
        invalidCsv
          ? "invalid-json\n"
          : unknownCsv
            ? '{"custom_id":"unknown","future_envelope":true}\n'
            : outputRecord,
      );
    if (url.pathname.endsWith("/files/file-error/content"))
      return new Response('{"custom_id":"002","error":{"code":"Example","message":"row error"}}\n');
    if (url.pathname.endsWith("/submit")) return Response.json(submitted);
    if (url.pathname.endsWith("/result"))
      return Response.json({
        ...parsed,
        data: {
          ...parsed.data,
          status: parseStatus,
          ...(parseStatus === "failed"
            ? { code: "EngineFailed", message: "original engine error" }
            : {}),
        },
      });
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
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
  dryRun?: boolean;
}
async function invoke(command: AnyCommand, flags: Record<string, unknown>, display: Display) {
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
  const consoleSpy = vi.spyOn(console, "error").mockImplementation((...messages: unknown[]) => {
    stderr += messages.map(String).join(" ") + "\n";
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    file: { language: "en-US", workspace_id: "ws-test" },
    env: {},
    configPath: join(directory, "config.json"),
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
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
      await command.run({
        identity,
        settings,
        client,
        flags,
        localize,
        output: reporter.output,
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, exitCode };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    consoleSpy.mockRestore();
  }
}
function diagnostics(stderr: string) {
  return stderr.trim()
    ? stderr
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}
const scenarios = [
  {
    name: "batch create",
    command: commands.batchCreate,
    flags: () => ({ inputFileId: "file-input", endpoint: "/v1/chat/completions" }),
    want: () => ({ ...job, status: "validating" }),
    text: "id: batch-one",
  },
  {
    name: "batch list",
    command: commands.batchList,
    flags: () => ({}),
    want: () => listed,
    text: "ID",
  },
  {
    name: "batch get",
    command: commands.batchGet,
    flags: () => ({ batchId: "batch-one" }),
    want: () => job,
    text: "id: batch-one",
  },
  {
    name: "batch cancel",
    command: commands.batchCancel,
    flags: () => ({ batchId: "batch-one" }),
    want: () => ({ ...job, status: "cancelling" }),
    text: "status: cancelling",
  },
  {
    name: "batch download",
    command: commands.batchDownload,
    flags: () => ({ batchId: "batch-one", outDir: join(directory, "download") }),
    want: () => ({
      batch_id: "batch-one",
      status: "completed",
      files: [join(directory, "download/result.jsonl"), join(directory, "download/error.jsonl")],
      line_counts: { "result.jsonl": 1, "error.jsonl": 1 },
    }),
    text: "batch_id: batch-one",
  },
  {
    name: "batch convert",
    command: commands.batchConvert,
    flags: () => ({
      file: join(directory, "input.csv"),
      outputFile: join(directory, "converted.jsonl"),
      model: "qwen-plus",
    }),
    want: () =>
      expect.objectContaining({
        records: 1,
        model: "qwen-plus",
        endpoint: "/v1/chat/completions",
        warnings: [],
        ignored_columns: [],
        output_file: join(directory, "converted.jsonl"),
      }),
    text: "records: 1",
  },
  {
    name: "parsex parse submit",
    command: commands.parsexParseSubmit,
    flags: () => ({ fileUrl: "https://source.invalid/document.pdf" }),
    want: () => submitted,
    text: "request_id: request-submit",
  },
  {
    name: "parsex extract submit",
    command: commands.parsexExtractSubmit,
    flags: () => ({ fileUrl: "https://source.invalid/document.pdf", configId: "config-one" }),
    want: () => submitted,
    text: "request_id: request-submit",
  },
  {
    name: "parsex parse result",
    command: commands.parsexParseResult,
    flags: () => ({ bizId: "biz-one" }),
    want: () => parsed,
    text: "request_id: request-result",
  },
  {
    name: "parsex extract result",
    command: commands.parsexExtractResult,
    flags: () => ({ bizId: "biz-one" }),
    want: () => parsed,
    text: "request_id: request-result",
  },
];
const modes = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
for (const scenario of scenarios) {
  test.each(modes)(`${scenario.name} preserves full final output: %j`, async (display) => {
    const result = await invoke(scenario.command, scenario.flags(), display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json") {
      expect(JSON.parse(result.stdout)).toEqual(scenario.want());
      expect(diagnostics(result.stderr).every((record) => record.debug !== undefined)).toBe(true);
    } else expect(result.stdout).toContain(scenario.text);
    expect(result.stdout + result.stderr).not.toContain("fixture-api-key");
    if (scenario.name === "batch convert")
      expect(await readFile(join(directory, "converted.jsonl"), "utf8")).toContain(
        '"custom_id":"001"',
      );
    if (scenario.name === "batch download")
      expect(await readFile(join(directory, "download/result.jsonl"), "utf8")).toBe(outputRecord);
  });
}

test.each([false, true])(
  "Batch and Parsex follow hide JSON progress, preserve terminal data (quiet=%s)",
  async (quiet) => {
    for (const command of [
      commands.batchGet,
      commands.parsexParseResult,
      commands.parsexExtractResult,
    ]) {
      const batch = command === commands.batchGet;
      const result = await invoke(
        command,
        batch ? { batchId: "batch-one", follow: true } : { bizId: "biz-one", follow: true },
        { format: "json", quiet },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(batch ? job : parsed);
      expect(result.stderr).toBe("");
    }
  },
);
test.each([false, true])(
  "text progress and next-page hints obey quiet=%s without changing results",
  async (quiet) => {
    const result = await invoke(
      commands.batchGet,
      { batchId: "batch-one", follow: true },
      { format: "text", quiet },
    );
    expect(result.stdout).toContain("id: batch-one");
    expect(result.stderr.includes("failed rows: 1")).toBe(!quiet);
    const page = await invoke(commands.batchList, {}, { format: "text", quiet });
    expect(page.stdout).toContain("ID");
    expect(page.stderr.includes("Next page")).toBe(!quiet);
  },
);
test.each([commands.batchGet, commands.parsexParseResult, commands.parsexExtractResult])(
  "failed query versus failed follow retains response and exit semantics",
  async (command) => {
    statuses = ["failed"];
    parseStatus = "failed";
    const flags = command === commands.batchGet ? { batchId: "batch-one" } : { bizId: "biz-one" };
    const single = await invoke(command, flags, { format: "json", quiet: true });
    expect(single.exitCode).toBe(0);
    const followed = await invoke(
      command,
      { ...flags, follow: true },
      { format: "json", quiet: true },
    );
    expect(followed.exitCode).toBe(1);
    expect(JSON.parse(followed.stdout)).toEqual(JSON.parse(single.stdout));
    const records = diagnostics(followed.stderr);
    expect(records).toHaveLength(1);
    expect(records[0].error.message).toContain(
      command === commands.batchGet ? "original task error" : "original engine error",
    );
  },
);
test("local Batch input warnings and uploaded-file recovery stay structured under JSON quiet", async () => {
  failCreate = true;
  const result = await invoke(
    commands.batchCreate,
    { file: join(directory, "input.jsonl") },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  const records = diagnostics(result.stderr);
  expect(records.map((record) => record.warning?.code ?? "error")).toEqual([
    "BATCH_VALIDATION_WARNING",
    "BATCH_INPUT_UPLOADED",
    "error",
  ]);
  expect(records[1].warning.details).toEqual({ file_id: "file-uploaded" });
  expect(records[2].error).toMatchObject({
    message: "original create error",
    request_id: "request-error",
    api_code: "Rejected",
    http_status: 400,
  });
  expect(requests.map((request) => [request.method, request.path])).toEqual([
    ["POST", "/compatible-mode/v1/files"],
    ["POST", "/compatible-mode/v1/batches"],
  ]);
});
test("failed CSV conversion keeps downloaded JSONL and structured recovery details", async () => {
  invalidCsv = true;
  const outDir = join(directory, "partial");
  const result = await invoke(
    commands.batchDownload,
    { batchId: "batch-one", outDir, csv: true },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(await readFile(join(outDir, "result.jsonl"), "utf8")).toBe("invalid-json\n");
  const records = diagnostics(result.stderr);
  expect(records[0].warning).toMatchObject({
    code: "BATCH_DOWNLOAD_PARTIAL",
    details: { stage: "CSV", files: [join(outDir, "result.jsonl"), join(outDir, "error.jsonl")] },
  });
  expect(records.at(-1).error).toBeDefined();
});
test("unknown CSV envelopes warn in JSON quiet while preserving the artifacts", async () => {
  unknownCsv = true;
  const result = await invoke(
    commands.batchDownload,
    { batchId: "batch-one", outDir: join(directory, "unknown"), csv: true },
    { format: "json", quiet: true },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).csv).toEqual({ records: 2, unknown_records: 1 });
  expect(diagnostics(result.stderr)[0].warning).toMatchObject({
    code: "BATCH_CSV_UNKNOWN_RECORDS",
    details: { unknown_records: 1 },
  });
});
test("unknown Batch state warns once and still polls the completed task", async () => {
  // Direct command invocation isolates rendering; public interval validation remains in the existing E2E suite.
  statuses = ["future-state", "future-state", "completed"];
  const result = await invoke(
    commands.batchGet,
    { batchId: "batch-one", follow: true, interval: 0 },
    { format: "json", quiet: true },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(job);
  const records = diagnostics(result.stderr);
  expect(records).toHaveLength(1);
  expect(records[0].warning).toMatchObject({
    code: "BATCH_UNKNOWN_STATE",
    details: { batch_id: "batch-one", status: "future-state" },
  });
  expect(requests).toHaveLength(3);
});
test.each(
  scenarios.filter(
    (scenario) => scenario.name.startsWith("batch ") && scenario.name !== "batch convert",
  ),
)("$name dry-run retains JSON preview with no HTTP/files", async (scenario) => {
  const result = await invoke(scenario.command, scenario.flags(), {
    format: "text",
    quiet: true,
    dryRun: true,
  });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).action).toBe(scenario.name.replace(" ", "."));
  expect(requests).toEqual([]);
});

test.each([false, true])(
  "Parsex text follow progress obeys quiet=%s and keeps the response",
  async (quiet) => {
    for (const command of [commands.parsexParseResult, commands.parsexExtractResult]) {
      const result = await invoke(
        command,
        { bizId: "biz-one", follow: true },
        { format: "text", quiet },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("request_id: request-result");
      expect(result.stdout).toContain("Hello");
      expect(result.stderr.includes("biz-one: success")).toBe(!quiet);
    }
  },
);
