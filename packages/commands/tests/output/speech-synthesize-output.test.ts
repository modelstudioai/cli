import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "child_process";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import { buildSettings, Client, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import synthesize from "../../src/commands/speech/synthesize.ts";

let directory: string;
let server: Server;
let origin: string;
let requests: Array<{ path: string; body: unknown; stream: boolean }>;
let downloads: number;
let failure: "none" | "submit" | "empty" | "download";
const audio = Buffer.from([0, 255, 13, 10, 1, 2, 3]);
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "bl-synthesize-output-"));
  requests = [];
  downloads = 0;
  failure = "none";
  server = createServer(async (request, response) => {
    if (request.url?.startsWith("/audio/")) {
      downloads++;
      if (failure === "download") {
        response.writeHead(503).end();
        return;
      }
      response.writeHead(200, { "content-length": String(audio.length) });
      response.write(audio.subarray(0, 3));
      response.end(audio.subarray(3));
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    const stream = request.headers["x-dashscope-sse"] === "enable";
    requests.push({ path: request.url!, body: JSON.parse(raw), stream });
    if (failure === "submit") {
      response.writeHead(429, { "content-type": "application/json" }).end(
        JSON.stringify({
          code: "ServiceLimit",
          message: "Original service failure",
          request_id: "request-test",
        }),
      );
      return;
    }
    if (stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: malformed\n\n");
      response.write(
        `data: ${JSON.stringify({ output: { audio: { data: audio.subarray(0, 3).toString("base64") } } })}\n\n`,
      );
      response.end(
        `data: ${JSON.stringify({ output: { audio: { data: audio.subarray(3).toString("base64"), url: `${origin}/audio/full.mp3` }, finish_reason: "stop" } })}\n\n`,
      );
    } else {
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          output: {
            audio:
              failure === "empty"
                ? {}
                : { url: `${origin}/audio/${requests.length}.mp3`, expires_at: 123456 },
          },
        }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback address");
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});

async function invoke(
  flags: Record<string, unknown>,
  display: {
    format: "text" | "json";
    quiet: boolean;
    verbose?: boolean;
    tty?: boolean;
    dryRun?: boolean;
    chinese?: boolean;
  },
) {
  const chunks: Buffer[] = [];
  let stderr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", {
    value: display.tty ?? false,
    configurable: true,
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    env: {},
    file: { output_dir: directory, timeout: 2 },
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
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    try {
      await synthesize.run({
        flags,
        settings,
        localize,
        output: reporter.output,
        identity,
        client,
      } as Parameters<typeof synthesize.run>[0]);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return {
      bytes: Buffer.concat(chunks),
      stdout: Buffer.concat(chunks).toString(),
      stderr,
      exitCode,
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    if (descriptor) Object.defineProperty(process.stderr, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stderr, "isTTY");
  }
}
const flags = { text: "Hello", voice: "test-voice", model: "qwen-audio-3.0-tts-plus" };
const displays = (["text", "json"] as const).flatMap((format) =>
  [false, true].flatMap((verbose) => [false, true].map((quiet) => ({ format, verbose, quiet }))),
);
function readResult(result: Awaited<ReturnType<typeof invoke>>, format: "text" | "json") {
  return format === "json" ? JSON.parse(result.stdout) : parseYaml(result.stdout);
}
function verifyDiagnostics(
  result: Awaited<ReturnType<typeof invoke>>,
  format: "text" | "json",
  verbose: boolean,
) {
  if (format === "json") {
    const records = result.stderr.trim()
      ? result.stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    expect(records.every((record) => record.debug)).toBe(true);
    expect(records.length > 0).toBe(verbose);
  }
  expect(result.stderr).not.toContain("test-placeholder");
}

test.each(displays)(
  "single download preserves metadata and bytes: $format q=$quiet v=$verbose",
  async (display) => {
    const destination = join(directory, "explicit.mp3");
    const result = await invoke({ ...flags, out: destination }, { ...display, tty: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(readResult(result, display.format)).toEqual({
      saved: destination,
      audio_url: `${origin}/audio/1.mp3`,
      model: flags.model,
      voice: flags.voice,
      url_expires_at: 123456,
    });
    expect(readFileSync(destination)).toEqual(audio);
    verifyDiagnostics(result, display.format, display.verbose);
    if (display.format === "text")
      expect(result.stderr.includes("\rDownloading")).toBe(!display.quiet);
    expect(requests).toEqual([
      {
        path: "/api/v1/services/audio/tts/SpeechSynthesizer",
        stream: false,
        body: { model: flags.model, input: { text: "Hello", voice: "test-voice", format: "mp3" } },
      },
    ]);
  },
);
test.each(displays)(
  "concurrent downloads keep full results: $format q=$quiet v=$verbose",
  async (display) => {
    const result = await invoke({ ...flags, concurrent: 2 }, display);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = readResult(result, display.format);
    expect(data).toMatchObject({
      audio_urls: [`${origin}/audio/1.mp3`, `${origin}/audio/2.mp3`],
      total: 2,
      model: flags.model,
      voice: flags.voice,
    });
    expect(data.saved).toHaveLength(2);
    for (const saved of data.saved) {
      expect(saved).toMatch(/tts_[0-9]+_00[12]\.mp3$/);
      expect(readFileSync(saved)).toEqual(audio);
    }
    expect(requests).toHaveLength(2);
    expect(downloads).toBe(2);
    verifyDiagnostics(result, display.format, display.verbose);
  },
);
test.each(displays)(
  "stream-to-file keeps JSON metadata and PCM bytes: $format q=$quiet v=$verbose",
  async (display) => {
    const destination = join(directory, "stream.pcm");
    const result = await invoke({ ...flags, stream: true, out: destination }, display);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(readResult(result, display.format)).toEqual({
      saved: destination,
      audio_url: `${origin}/audio/full.mp3`,
      model: flags.model,
      voice: flags.voice,
    });
    expect(readFileSync(destination)).toEqual(audio);
    expect(requests[0]).toMatchObject({ stream: true, body: { input: { format: "pcm" } } });
    verifyDiagnostics(result, display.format, display.verbose);
  },
);
test.each([false, true])(
  "raw text streaming preserves exact stdout bytes with quiet=%s",
  async (quiet) => {
    const result = await invoke({ ...flags, stream: true }, { format: "text", quiet });
    expect(result.exitCode).toBe(0);
    expect(result.bytes).toEqual(audio);
    expect(result.stderr.includes("Full audio URL:")).toBe(!quiet);
  },
);
test.each([false, true])(
  "JSON raw-stream conflict is rejected before API/file access with quiet=%s",
  async (quiet) => {
    const result = await invoke(
      { ...flags, text: undefined, textFile: join(directory, "missing.txt"), stream: true },
      { format: "json", quiet, chinese: true },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(requests).toEqual([]);
    expect(downloads).toBe(0);
    const error = JSON.parse(result.stderr).error;
    expect(error.message).toContain("--out");
    expect(error.message).not.toContain("missing.txt");
  },
);
test("stream dry-run still allows JSON preview without --out", async () => {
  const result = await invoke(
    { ...flags, stream: true },
    { format: "json", quiet: true, dryRun: true },
  );
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ request: { input: { format: "pcm" } } });
  expect(requests).toEqual([]);
  expect(result.stderr).toBe("");
});
test.each(["qwen-audio-3.0-tts-plus", "cosyvoice-v3.5-flash", "unknown-model"])(
  "voice list returns one JSON result for %s",
  async (model) => {
    const result = await invoke({ listVoices: true, model }, { format: "json", quiet: true });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.model).toBe(model);
    expect(data.voice_list_url).toBeTypeOf("string");
    if (model === "unknown-model") {
      expect(data.voices).toBeNull();
      expect(data.total).toBeNull();
    } else if (model === "cosyvoice-v3.5-flash") {
      expect(data.voices).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.clone_design_docs_url).toBeTypeOf("string");
    } else {
      expect(data.total).toBe(2);
      expect(data.voices.map((entry: { voice: string }) => entry.voice)).toEqual([
        "longanlingxin",
        "longanlufeng",
      ]);
    }
    expect(requests).toEqual([]);
    expect(result.stderr).toBe("");
  },
);
test.each(["submit", "empty", "download"] as const)(
  "nonstream %s failure retains one JSON error",
  async (mode) => {
    failure = mode;
    const result = await invoke(flags, { format: "json", quiet: true, verbose: true });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const errors = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((record) => record.error);
    expect(errors).toHaveLength(1);
    if (mode === "submit")
      expect(errors[0].error).toMatchObject({
        message: "Original service failure",
        api_code: "ServiceLimit",
        request_id: "request-test",
      });
  },
);
test("text-file parsing and explicit audio parameters remain unchanged", async () => {
  const textFile = join(directory, "text.txt");
  writeFileSync(textFile, "  File text  ");
  const result = await invoke(
    {
      ...flags,
      text: undefined,
      textFile,
      out: join(directory, "custom.wav"),
      format: "wav",
      sampleRate: "24000",
      volume: "50",
      rate: "1.2",
      pitch: "1.1",
      seed: "42",
      enableSsml: true,
      language: "en",
      instruction: "Warm",
    },
    { format: "json", quiet: true },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(requests[0]!.body).toEqual({
    model: flags.model,
    input: {
      text: "File text",
      voice: flags.voice,
      format: "wav",
      sample_rate: 24000,
      volume: 50,
      rate: 1.2,
      pitch: 1.1,
      seed: 42,
      enable_ssml: true,
      language_hints: ["en"],
      instruction: "Warm",
    },
  });
});
test("ordinary non-TTY download keeps progress hidden", async () => {
  const result = await invoke(
    { ...flags, out: join(directory, "plain.mp3") },
    { format: "text", quiet: false, tty: false },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr).not.toContain("\rDownloading");
  expect(result.stderr).toContain("[Model:");
});

test("JSON raw streaming with valid input is rejected before submission", async () => {
  const result = await invoke({ ...flags, stream: true }, { format: "json", quiet: true });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(requests).toEqual([]);
  expect(JSON.parse(result.stderr).error.message).toContain("--out");
});
test("model and voice-list process prose supports Chinese", async () => {
  const result = await invoke(
    { ...flags, out: join(directory, "zh.mp3") },
    { format: "text", quiet: false, chinese: true },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain("[模型：");
  const list = await invoke(
    { listVoices: true, model: "unknown-model" },
    { format: "text", quiet: false, chinese: true },
  );
  expect(list.stdout).toContain("未提供内置音色列表");
});

const cliModes = ["raw", "raw-quiet", "stream-file", "conflict", "download", "voices"] as const;
test.each(cliModes)("real CLI preserves binary/JSON boundaries for %s", async (mode) => {
  writeFileSync(join(directory, "config.json"), JSON.stringify({ language: "en-US" }));
  const destination = join(directory, mode === "stream-file" ? "cli.pcm" : "cli.mp3");
  const args = ["speech", "synthesize", "--model", flags.model];
  if (mode === "voices") args.push("--list-voices");
  else args.push("--text", "Hello", "--voice", flags.voice);
  if (["raw", "raw-quiet", "stream-file", "conflict"].includes(mode)) args.push("--stream");
  if (mode === "stream-file" || mode === "download") args.push("--out", destination);
  const raw = mode === "raw" || mode === "raw-quiet";
  args.push("--output", raw ? "text" : "json");
  if (mode !== "raw") args.push("--quiet");
  if (!raw) args.push("--verbose");
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
          { path: "speech synthesize", export: "speechSynthesize" },
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
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const bytes = Buffer.concat(chunks);
  const stderr = Buffer.concat(errors).toString();
  if (raw) {
    expect(exitCode, stderr).toBe(0);
    expect(bytes).toEqual(audio);
    if (mode === "raw-quiet") expect(stderr).toBe("");
  } else {
    const records = stderr.trim()
      ? stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    if (mode === "conflict") {
      expect(exitCode).toBe(2);
      expect(bytes.length).toBe(0);
      expect(records).toHaveLength(1);
      expect(requests).toEqual([]);
    } else {
      expect(exitCode, stderr).toBe(0);
      const data = JSON.parse(bytes.toString());
      if (mode === "voices") {
        expect(data.total).toBe(2);
        expect(requests).toEqual([]);
      } else {
        expect(data.saved).toBe(destination);
        expect(readFileSync(destination)).toEqual(audio);
        expect(requests).toHaveLength(1);
      }
      expect(records.every((record) => record.debug)).toBe(true);
    }
  }
});
