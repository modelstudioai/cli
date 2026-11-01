import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "child_process";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { buildSettings, Client, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import recognize from "../../src/commands/speech/recognize.ts";

let directory: string;
let server: Server;
let origin: string;
let requests: Array<{ path: string; body: unknown; async: boolean; sse?: string }>;
let downloads: string[];
let polls: number;
let pendingFirst: boolean;
let syncResponse: Record<string, unknown>;
let taskOutput: Record<string, unknown>;
let documents: Record<string, Record<string, unknown>>;
let failure: "none" | "submit" | "download";
const audioUrl = "https://example.com/audio.wav";
const flags = { url: [audioUrl], model: "fun-asr" };
const displays = (["text", "json"] as const).flatMap((format) =>
  [false, true].flatMap((quiet) => [false, true].map((verbose) => ({ format, quiet, verbose }))),
);

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "bl-recognize-output-"));
  requests = [];
  downloads = [];
  polls = 0;
  pendingFirst = false;
  failure = "none";
  syncResponse = {
    output: { text: "Hello\n" },
    request_id: "sync-request",
    usage: { duration: 1 },
  };
  server = createServer(async (request, response) => {
    const path = request.url!;
    response.setHeader("content-type", "application/json");
    if (path.startsWith("/transcript/")) {
      downloads.push(path);
      if (failure === "download" || path === "/transcript/failing")
        response.writeHead(503).end("{}");
      else response.end(JSON.stringify(documents[path]));
      return;
    }
    if (path.startsWith("/api/v1/tasks/")) {
      polls++;
      if (pendingFirst && polls === 1) {
        response.end(JSON.stringify({ output: { task_id: "task-test", task_status: "RUNNING" } }));
        return;
      }
      response.end(
        JSON.stringify({ output: taskOutput, request_id: "poll-request", usage: { duration: 2 } }),
      );
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    requests.push({
      path,
      body: JSON.parse(raw),
      async: request.headers["x-dashscope-async"] === "enable",
      sse: request.headers["x-dashscope-sse"] as string | undefined,
    });
    if (failure === "submit") {
      response.writeHead(429).end(
        JSON.stringify({
          code: "ServiceLimit",
          message: "Original service failure",
          request_id: "failed-request",
        }),
      );
    } else if (path.includes("multimodal-generation")) response.end(JSON.stringify(syncResponse));
    else
      response.end(
        JSON.stringify({
          output: { task_id: "task-test", task_status: "PENDING" },
          request_id: "submit-request",
        }),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback address");
  origin = `http://127.0.0.1:${address.port}`;
  taskOutput = {
    task_id: "task-test",
    task_status: "SUCCEEDED",
    results: [
      {
        file_url: audioUrl,
        subtask_status: "SUCCEEDED",
        transcription_url: `${origin}/transcript/one`,
      },
    ],
  };
  documents = {
    "/transcript/one": {
      file_url: audioUrl,
      transcripts: [{ sentences: [{ text: "Hello", speaker_id: 0 }, { text: "世界" }] }],
      properties: { duration: 2 },
    },
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});

async function invoke(
  commandFlags: Record<string, unknown>,
  display: {
    format: "text" | "json";
    quiet: boolean;
    verbose?: boolean;
    dryRun?: boolean;
    chinese?: boolean;
  },
) {
  let stdout = "";
  let stderr = "";
  let combined = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    combined += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    combined += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    env: {},
    file: { timeout: 2 },
    configPath: join(directory, "config.json"),
  });
  const localize = (text: LocalizedText) =>
    typeof text === "string" ? text : text[display.chinese ? "zh-CN" : "en-US"];
  const reporter = createOutputReporter({ settings, localize });
  const identity = { binName: "bl", version: "test", npmPackage: "test", clientName: "test" };
  const client = new Client({
    settings,
    identity,
    baseUrl: origin,
    apiCred: { token: "test-placeholder", source: "flag", baseUrl: origin },
    debug: (details) => reporter.output.debug(details),
  });
  let exitCode = 0;
  try {
    try {
      await recognize.run({
        flags: commandFlags,
        settings,
        localize,
        output: reporter.output,
        identity,
        client,
      } as Parameters<typeof recognize.run>[0]);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, combined, exitCode };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}
function checkDiagnostics(
  result: Awaited<ReturnType<typeof invoke>>,
  display: (typeof displays)[number],
) {
  expect(result.stderr).not.toContain("test-placeholder");
  if (display.format === "json") {
    const records = result.stderr.trim()
      ? result.stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    expect(records.every((record) => record.debug)).toBe(true);
    expect(records.length > 0).toBe(display.verbose);
  } else if (!display.verbose) {
    expect(result.stderr.includes("[Model:")).toBe(!display.quiet);
    expect(result.stderr.includes("Full result saved to:")).toBe(!display.quiet);
  }
}

test.each(displays)(
  "sync response keeps full JSON and existing text: $format q=$quiet v=$verbose",
  async (display) => {
    const destination = join(directory, "sync.json");
    const result = await invoke({ ...flags, model: "fun-asr-flash", out: destination }, display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(syncResponse);
    else expect(result.stdout).toBe("Hello\n");
    expect(readFileSync(destination, "utf8")).toBe(JSON.stringify(syncResponse, null, 2) + "\n");
    expect(requests).toEqual([
      {
        path: "/api/v1/services/aigc/multimodal-generation/generation",
        async: false,
        sse: "disable",
        body: {
          model: "fun-asr-flash",
          input: {
            messages: [
              { role: "user", content: [{ type: "input_audio", input_audio: { data: audioUrl } }] },
            ],
          },
          parameters: { format: "wav", sample_rate: "16000" },
        },
      },
    ]);
    expect(polls).toBe(0);
    checkDiagnostics(result, display);
  },
);

test.each(displays)(
  "async result retains task and transcript metadata: $format q=$quiet v=$verbose",
  async (display) => {
    const destination = join(directory, "async.json");
    const result = await invoke({ ...flags, out: destination, pollInterval: 0 }, display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        output: taskOutput,
        request_id: "poll-request",
        usage: { duration: 2 },
        transcriptions: [documents["/transcript/one"]],
      });
    else expect(result.stdout).toBe("Hello [Speaker 0]\n世界\n");
    expect(readFileSync(destination, "utf8")).toBe(
      JSON.stringify(documents["/transcript/one"], null, 2) + "\n",
    );
    expect(requests[0]).toEqual({
      path: "/api/v1/services/audio/asr/transcription",
      async: true,
      sse: undefined,
      body: { model: "fun-asr", input: { file_urls: [audioUrl] }, parameters: { channel_id: [0] } },
    });
    expect(polls).toBe(1);
    expect(downloads).toEqual(["/transcript/one"]);
    checkDiagnostics(result, display);
  },
);

test.each(displays)(
  "batch subtask failures remain visible with success data: $format q=$quiet v=$verbose",
  async (display) => {
    const secondUrl = "https://example.com/failed.wav";
    taskOutput.results = [
      ...(taskOutput.results as unknown[]),
      {
        file_url: secondUrl,
        subtask_status: "FAILED",
        code: "BadAudio",
        message: "Service subtask message",
      },
    ];
    const destination = join(directory, "mixed.json");
    const result = await invoke(
      { ...flags, url: [audioUrl, secondUrl], out: destination, pollInterval: 0 },
      display,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        output: taskOutput,
        request_id: "poll-request",
        usage: { duration: 2 },
        transcriptions: [documents["/transcript/one"]],
      });
    else
      expect(result.stdout).toBe(
        `=== [1/2] ${audioUrl} ===\nHello [Speaker 0]\n世界\n\n=== [2/2] ${secondUrl} ===\n[FAILED] ${secondUrl} — Service subtask message\n\n`,
      );
    expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(documents["/transcript/one"]);
    expect(downloads).toEqual(["/transcript/one"]);
    checkDiagnostics(result, display);
  },
);

test.each(["text", "json"] as const)(
  "multiple successful downloads keep order and out-file array: %s",
  async (format) => {
    documents["/transcript/two"] = { transcripts: [{ text: "Second" }] };
    taskOutput.results = [
      ...(taskOutput.results as unknown[]),
      {
        file_url: "https://example.com/two.wav",
        subtask_status: "SUCCEEDED",
        transcription_url: `${origin}/transcript/two`,
      },
    ];
    const destination = join(directory, "batch.json");
    const result = await invoke(
      {
        ...flags,
        url: [audioUrl, "https://example.com/two.wav"],
        out: destination,
        pollInterval: 0,
      },
      { format, quiet: true },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const data = [documents["/transcript/one"], documents["/transcript/two"]];
    expect(JSON.parse(readFileSync(destination, "utf8"))).toEqual(data);
    expect(downloads).toEqual(["/transcript/one", "/transcript/two"]);
    if (format === "json") expect(JSON.parse(result.stdout).transcriptions).toEqual(data);
    else
      expect(result.stdout).toBe(
        `=== [1/2] ${audioUrl} ===\nHello [Speaker 0]\n世界\n\n=== [2/2] https://example.com/two.wav ===\nSecond\n\n`,
      );
  },
);

test.each(["text", "json"] as const)(
  "qwen3 singular task result is collected: %s",
  async (format) => {
    taskOutput = {
      task_id: "task-test",
      task_status: "SUCCEEDED",
      result: { transcription_url: `${origin}/transcript/one` },
    };
    const result = await invoke(
      { ...flags, model: "qwen3-asr-flash-filetrans", language: "zh", pollInterval: 0 },
      { format, quiet: true },
    );
    expect(result.exitCode).toBe(0);
    if (format === "json")
      expect(JSON.parse(result.stdout)).toMatchObject({
        output: taskOutput,
        transcriptions: [documents["/transcript/one"]],
      });
    else expect(result.stdout).toBe("Hello [Speaker 0]\n世界\n");
    expect(requests[0]!.body).toEqual({
      model: "qwen3-asr-flash-filetrans",
      input: { file_url: audioUrl },
      parameters: { channel_id: [0], language: "zh" },
    });
  },
);

test.each(["text", "json"] as const)(
  "empty sync text falls back to full response: %s",
  async (format) => {
    syncResponse = { output: { custom: true }, request_id: "fallback-request" };
    const result = await invoke({ ...flags, model: "fun-asr-flash" }, { format, quiet: true });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(syncResponse);
    if (format === "text") expect(result.stdout).toBe(JSON.stringify(syncResponse) + "\n");
  },
);

test.each(["text", "json"] as const)(
  "unrecognized transcript fields preserve raw data: %s",
  async (format) => {
    documents["/transcript/one"] = { custom: "raw result", file_url: audioUrl };
    const result = await invoke({ ...flags, pollInterval: 0 }, { format, quiet: true });
    expect(result.exitCode).toBe(0);
    if (format === "json")
      expect(JSON.parse(result.stdout).transcriptions).toEqual([documents["/transcript/one"]]);
    else expect(result.stdout).toBe(JSON.stringify(documents["/transcript/one"]) + "\n");
  },
);

test.each(["text", "json"] as const)(
  "all failed subtasks retain report and original exit code: %s",
  async (format) => {
    taskOutput.results = [
      {
        file_url: audioUrl,
        subtask_status: "FAILED",
        code: "AudioRejected",
        message: "Original subtask rejection",
      },
    ];
    const destination = join(directory, "all-failed.json");
    const result = await invoke(
      { ...flags, out: destination, pollInterval: 0 },
      { format, quiet: true },
    );
    expect(result.exitCode).toBe(0);
    if (format === "json")
      expect(JSON.parse(result.stdout)).toMatchObject({ output: taskOutput, transcriptions: [] });
    else expect(result.stdout).toBe(`[FAILED] ${audioUrl} — Original subtask rejection\n`);
    expect(readFileSync(destination, "utf8")).toBe("[]\n");
    expect(downloads).toEqual([]);
  },
);

test("missing transcription URL remains silent in text and preserves metadata in JSON", async () => {
  taskOutput.results = [{ file_url: audioUrl, subtask_status: "SUCCEEDED" }];
  const text = await invoke({ ...flags, pollInterval: 0 }, { format: "text", quiet: true });
  expect(text.stdout).toBe("");
  const json = await invoke({ ...flags, pollInterval: 0 }, { format: "json", quiet: true });
  expect(JSON.parse(json.stdout)).toMatchObject({ output: taskOutput, transcriptions: [] });
});

test.each(displays)(
  "empty async result retains task JSON and text summary without writing --out: $format q=$quiet v=$verbose",
  async (display) => {
    taskOutput = {
      task_id: "task-test",
      task_status: "SUCCEEDED",
      results: [],
      future: { values: [false, 0, null, []] },
    };
    const destination = join(directory, "unused.json");
    const result = await invoke({ ...flags, out: destination, pollInterval: 0 }, display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json")
      expect(JSON.parse(result.stdout)).toEqual({
        output: taskOutput,
        request_id: "poll-request",
        usage: { duration: 2 },
        transcriptions: [],
      });
    else expect(result.stdout).toBe("task_id: task-test\nstatus: SUCCEEDED\n");
    expect(requests).toHaveLength(1);
    expect(polls).toBe(1);
    expect(downloads).toEqual([]);
    expect(existsSync(destination)).toBe(false);
    expect(result.stderr).not.toContain("Full result saved to:");
    expect(result.stderr).not.toContain("test-placeholder");
    if (display.format === "json") checkDiagnostics(result, display);
    else expect(result.stderr.includes("[Model:")).toBe(!display.quiet);
  },
);

test.each(["text", "json"] as const)(
  "submission-only returns task ID without polling or writing: %s",
  async (format) => {
    const destination = join(directory, "unused.json");
    const result = await invoke(
      { ...flags, async: true, out: destination },
      { format, quiet: true },
    );
    expect(result.exitCode).toBe(0);
    if (format === "json") expect(JSON.parse(result.stdout)).toEqual({ task_id: "task-test" });
    else expect(result.stdout).toBe("task_id: task-test\n");
    expect(polls).toBe(0);
    expect(downloads).toEqual([]);
    expect(existsSync(destination)).toBe(false);
  },
);

test.each(["fun-asr-flash", "qwen3-asr-flash"])(
  "dry-run %s keeps request preview without API/files",
  async (model) => {
    const destination = join(directory, "unused.json");
    const result = await invoke(
      { ...flags, model, out: destination },
      { format: "json", quiet: true, dryRun: true },
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "sync",
      path: "/api/v1/services/aigc/multimodal-generation/generation",
      request: { model },
    });
    expect(requests).toEqual([]);
    expect(existsSync(destination)).toBe(false);
  },
);

test("async dry-run keeps context/vocabulary and skips submission", async () => {
  const result = await invoke(
    {
      ...flags,
      model: "qwen-audio-3.0-asr-flash-filetrans",
      context: "Bailian",
      vocabulary: '{"Bailian":4}',
      language: "en",
      diarization: true,
      speakerCount: 2,
      channelId: 1,
    },
    { format: "json", quiet: true, dryRun: true },
  );
  expect(JSON.parse(result.stdout)).toEqual({
    mode: "async",
    path: "/api/v1/services/audio/asr/transcription",
    request: {
      model: "qwen-audio-3.0-asr-flash-filetrans",
      input: {
        file_urls: [audioUrl],
        context: [{ role: "user", content: [{ type: "input_text", text: "Bailian" }] }],
      },
      parameters: {
        channel_id: [1],
        language_hints: ["en"],
        diarization_enabled: true,
        speaker_count: 2,
        vocabulary: { Bailian: 4 },
      },
    },
  });
  expect(requests).toEqual([]);
});

test("qwen3 sync keeps request and choices text extraction", async () => {
  syncResponse = {
    output: { choices: [{ message: { content: [{ text: "First" }, { text: " second" }] } }] },
    request_id: "qwen3-request",
  };
  const result = await invoke(
    { ...flags, model: "qwen3-asr-flash", language: "en" },
    { format: "text", quiet: true },
  );
  expect(result.stdout).toBe("First second\n");
  expect(requests[0]!.body).toEqual({
    model: "qwen3-asr-flash",
    input: { messages: [{ role: "user", content: [{ audio: audioUrl }] }] },
    parameters: { asr_options: { language: "en" } },
  });
});

test.each(["submit", "download", "task", "file"] as const)(
  "failure %s emits one JSON error and no final stdout",
  async (mode) => {
    if (mode === "submit" || mode === "download") failure = mode;
    if (mode === "task")
      taskOutput = {
        task_id: "task-test",
        task_status: "FAILED",
        message: "Original task failure",
      };
    const result = await invoke(
      {
        ...flags,
        pollInterval: 0,
        ...(mode === "file" ? { out: join(directory, "missing", "result.json") } : {}),
      },
      { format: "json", quiet: true, verbose: true },
    );
    expect(result.exitCode, result.stderr).toBe(1);
    expect(result.stdout).toBe("");
    const records = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const errors = records.filter((record) => record.error);
    expect(errors).toHaveLength(1);
    if (mode === "submit")
      expect(errors[0].error).toMatchObject({
        message: "Original service failure",
        api_code: "ServiceLimit",
        request_id: "failed-request",
      });
    if (mode === "task") expect(errors[0].error.message).toContain("Original task failure");
  },
);

test("sync failed file write emits no result", async () => {
  const result = await invoke(
    { ...flags, model: "fun-asr-flash", out: join(directory, "missing", "result.json") },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).error).toBeDefined();
});

test.each([
  { model: "fun-asr", speakerCount: 2 },
  { model: "qwen3-asr-flash", vocabulary: '{"Bailian":4}' },
  { model: "qwen3-asr-flash-filetrans", url: [audioUrl, audioUrl] },
  { model: "qwen3-asr-flash-realtime" },
])("existing validation rejects before API: $model", async (invalid) => {
  const result = await invoke({ ...flags, ...invalid }, { format: "json", quiet: true });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).error).toBeDefined();
  expect(requests).toEqual([]);
});

test("model and saved process messages support Chinese", async () => {
  const result = await invoke(
    { ...flags, model: "fun-asr-flash", out: join(directory, "zh.json") },
    { format: "text", quiet: false, chinese: true },
  );
  expect(result.stderr).toContain("[模型：");
  expect(result.stderr).toContain("完整结果已保存至：");
  expect(result.stdout).toBe("Hello\n");
});

test.each(["sync", "async", "batch", "submit", "file-error", "usage"])(
  "real CLI output boundaries: %s",
  async (mode) => {
    writeFileSync(join(directory, "config.json"), JSON.stringify({ language: "en-US" }));
    const args = [
      "speech",
      "recognize",
      "--url",
      audioUrl,
      "--model",
      mode === "sync" ? "fun-asr-flash" : "fun-asr",
      "--output",
      "json",
      "--quiet",
      "--verbose",
      "--poll-interval",
      "0",
    ];
    if (mode === "sync") args.splice(args.length - 2, 2);
    if (mode === "batch") args.push("--url", "https://example.com/two.wav");
    if (mode === "submit") args.push("--async");
    if (mode === "file-error") args.push("--out", join(directory, "missing", "result.json"));
    if (mode === "usage") args.push("--speaker-count", "2");
    const child = spawn(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("../e2e/harness/main.ts", import.meta.url)),
        ...args,
      ],
      {
        env: {
          ...process.env,
          HOME: directory,
          BAILIAN_CONFIG_DIR: directory,
          BAILIAN_E2E_ROUTES: JSON.stringify([
            { path: "speech recognize", export: "speechRecognize" },
          ]),
          DASHSCOPE_API_KEY: "test-placeholder",
          DASHSCOPE_BASE_URL: origin,
          DASHSCOPE_QUIET: "0",
          DASHSCOPE_VERBOSE: "0",
          DO_NOT_TRACK: "1",
          BAILIAN_INSTALL_METHOD: "brew",
          NODE_NO_WARNINGS: "1",
          NODE_USE_ENV_PROXY: "0",
          HTTP_PROXY: "",
          http_proxy: "",
          HTTPS_PROXY: "",
          https_proxy: "",
          ALL_PROXY: "",
          all_proxy: "",
          NO_PROXY: "",
          no_proxy: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    const records = stderr.trim()
      ? stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    if (mode === "file-error" || mode === "usage") {
      expect(exitCode, stderr).toBe(mode === "usage" ? 2 : 1);
      expect(stdout).toBe("");
      expect(records.filter((record) => record.error)).toHaveLength(1);
    } else {
      expect(exitCode, stderr).toBe(0);
      const data = JSON.parse(stdout);
      if (mode === "sync") expect(data).toEqual(syncResponse);
      else if (mode === "submit") {
        expect(data).toEqual({ task_id: "task-test" });
        expect(polls).toBe(0);
      } else
        expect(data).toMatchObject({
          output: taskOutput,
          transcriptions: [documents["/transcript/one"]],
        });
      expect(records.every((record) => record.debug)).toBe(true);
    }
  },
);

test("a later download failure never leaves a partial JSON result", async () => {
  taskOutput.results = [
    ...(taskOutput.results as unknown[]),
    {
      file_url: "https://example.com/bad.wav",
      subtask_status: "SUCCEEDED",
      transcription_url: `${origin}/transcript/failing`,
    },
  ];
  const result = await invoke(
    { ...flags, url: [audioUrl, "https://example.com/bad.wav"], pollInterval: 0 },
    { format: "json", quiet: true },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).error.message).toContain("HTTP 503");
  expect(downloads).toEqual(["/transcript/one", "/transcript/failing"]);
});

test("pending polls retain progress in text and stay hidden in JSON", async () => {
  pendingFirst = true;
  const result = await invoke({ ...flags, pollInterval: 0 }, { format: "text", quiet: false });
  expect(result.exitCode).toBe(0);
  expect(polls).toBe(2);
  expect(result.stderr).toContain("Status: RUNNING");
  expect(result.stderr).toContain("Status: SUCCEEDED");
  polls = 0;
  const json = await invoke({ ...flags, pollInterval: 0 }, { format: "json", quiet: false });
  expect(json.exitCode).toBe(0);
  expect(polls).toBe(2);
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout).transcriptions).toHaveLength(1);
});

test.each([
  { output: { sentence: { text: "Sentence" } }, expected: "Sentence\n" },
  { output: { output: { sentence: { text: "Nested\n\n" } } }, expected: "Nested\n\n" },
])(
  "sync sentence variants preserve exact newline behavior: $expected",
  async ({ output, expected }) => {
    syncResponse = { output, request_id: "sentence-request" };
    const result = await invoke(
      { ...flags, model: "fun-asr-flash" },
      { format: "text", quiet: true },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(expected);
  },
);

test.each(["sync", "async"])("saved notice follows the transcription: %s", async (mode) => {
  const result = await invoke(
    {
      ...flags,
      ...(mode === "sync" ? { model: "fun-asr-flash" } : { pollInterval: 0 }),
      out: join(directory, "ordered.json"),
    },
    { format: "text", quiet: false },
  );
  expect(result.exitCode).toBe(0);
  expect(result.combined.indexOf("Hello")).toBeGreaterThanOrEqual(0);
  expect(result.combined.indexOf("Hello")).toBeLessThan(
    result.combined.indexOf("Full result saved to:"),
  );
});
