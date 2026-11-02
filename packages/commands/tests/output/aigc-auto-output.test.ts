import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import {
  buildSettings,
  ExitCode,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import imageGenerate from "../../src/commands/image/generate.ts";
import imageEdit from "../../src/commands/image/edit.ts";
import synthesize from "../../src/commands/speech/synthesize.ts";
import recognize from "../../src/commands/speech/recognize.ts";
import videoGenerate from "../../src/commands/video/generate.ts";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "bl-auto-output-"));
  vi.spyOn(Date, "now").mockReturnValue(1790000000000);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

const entries = [
  { name: "image-generate", command: imageGenerate, flags: { prompt: "A cat", concurrent: 2 } },
  {
    name: "image-edit",
    command: imageEdit,
    flags: { prompt: "Blue", image: ["https://fixture.invalid/source.png"], concurrent: 2 },
  },
  { name: "tts-single", command: synthesize, flags: { text: "Hello", voice: "温柔女声" } },
  {
    name: "tts-concurrent",
    command: synthesize,
    flags: { text: "Hello", voice: "温柔女声", concurrent: 2 },
  },
  { name: "asr", command: recognize, flags: { url: ["https://fixture.invalid/source.wav"] } },
  {
    name: "video-default",
    command: videoGenerate,
    flags: { prompt: "A lake", concurrent: 2, pollInterval: 0 },
  },
  { name: "video-explicit", command: videoGenerate, flags: { prompt: "A lake", pollInterval: 0 } },
];
type Entry = { name: string; command: AnyCommand; flags: Record<string, unknown> };
type Failure = "none" | "tool" | "download" | "task" | "timeout";

async function invoke(
  entry: Entry,
  format: "text" | "json",
  quiet: boolean,
  failure: Failure = "none",
) {
  if (failure === "timeout") vi.spyOn(Date, "now").mockRestore();
  const settings = buildSettings({
    flags: { output: format, quiet, verbose: format === "json" },
    env: {},
    file: { output_dir: directory, timeout: failure === "timeout" ? 0.001 : 1 },
    configPath: join(directory, "config.json"),
  });
  let stdout = "";
  let stderr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const tty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
  const reporter = createOutputReporter({ settings, localize });
  const close = vi.fn();
  let submissions = 0;
  const polls = new Map<string, number>();
  const callTool = vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (failure === "tool")
      return { isError: true, content: [{ type: "text", text: "Original tool failure" }] };
    let payload: unknown;
    if (tool.includes("fetch_result")) {
      const taskId = String(args.task_id);
      const count = (polls.get(taskId) ?? 0) + 1;
      polls.set(taskId, count);
      payload = {
        task_id: taskId,
        task_status:
          failure === "task"
            ? "FAILED"
            : failure === "timeout" || count === 1
              ? "RUNNING"
              : "SUCCEEDED",
        video_url: `https://fixture.invalid/${taskId}.mp4`,
        message: "Original task failure",
      };
    } else if (tool.includes("submit_task")) payload = { task_id: `task-${++submissions}` };
    else if (tool === "bailian_tts")
      payload = {
        result: `https://fixture.invalid/audio-${++submissions}.wav`,
        request_id: "tts-request",
      };
    else if (tool === "bailian_speech_to_text")
      payload = {
        results: ["First line", "Second line\n"],
        request_id: "asr-request",
        preserved: "service metadata",
      };
    else payload = { results: [`https://fixture.invalid/image-${++submissions}.png`] };
    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  });
  const connect = vi.fn(async () => ({
    client: { callTool, close },
    url: "https://fixture.invalid/mcp",
  }));
  const download = vi.spyOn(httpTransport, "fetch").mockImplementation(async () => {
    if (failure === "download") return new Response("unavailable", { status: 503 });
    return new Response("payload", { headers: { "content-length": "7" } });
  });
  const flags: Record<string, unknown> = {
    ...entry.flags,
    model: "auto",
    outDir: directory,
    outPrefix: "fixture",
  };
  if (entry.name === "tts-single") flags.out = join(directory, "voice.wav");
  if (entry.name === "asr") flags.out = join(directory, "transcripts.json");
  if (entry.name === "video-explicit") flags.download = join(directory, "video.mp4");
  let exitCode = 0;
  try {
    try {
      await entry.command.run({
        flags,
        settings,
        output: reporter.output,
        localize,
        client: {
          usesTokenPlanConnection: () => false,
          url: (path: string) => `https://fixture.invalid${path}`,
          connectBailianMcp: connect,
        },
      } as unknown as Parameters<AnyCommand["run"]>[0]);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return {
      stdout,
      stderr,
      exitCode,
      data: stdout
        ? format === "json"
          ? JSON.parse(stdout)
          : entry.name === "asr"
            ? stdout
            : parseYaml(stdout)
        : undefined,
      diagnostics:
        format === "json" && stderr
          ? stderr
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
          : [],
      calls: callTool.mock.calls,
      downloads: download.mock.calls.length,
      closes: close.mock.calls.length,
      connections: connect.mock.calls.length,
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    download.mockRestore();
    if (tty) Object.defineProperty(process.stderr, "isTTY", tty);
    else Reflect.deleteProperty(process.stderr, "isTTY");
  }
}

function sortedData(data: { videos?: Array<{ task_id: string }> } | undefined) {
  return data?.videos
    ? {
        ...data,
        videos: [...data.videos].sort((left, right) => left.task_id.localeCompare(right.task_id)),
      }
    : data;
}

for (const entry of entries) {
  test.each(["text", "json"] as const)(
    `${entry.name} auto preserves results, requests and files in %s with quiet`,
    async (format) => {
      const normal = await invoke(entry, format, false);
      const quiet = await invoke(entry, format, true);
      expect(normal.exitCode, normal.stderr).toBe(0);
      expect(quiet.exitCode, quiet.stderr).toBe(0);
      expect(sortedData(quiet.data)).toEqual(sortedData(normal.data));
      expect(quiet.calls).toEqual(normal.calls);
      expect(quiet.connections).toBe(1);
      expect(quiet.closes).toBe(1);
      expect(quiet.stderr).toBe("");
      if (format === "json") expect(normal.stderr).toBe("");
      else expect(normal.stderr).toContain("[Model: auto] [Mode: mcp]");
      const expectedFiles = entry.name === "asr" ? 0 : "concurrent" in entry.flags ? 2 : 1;
      expect(quiet.downloads).toBe(expectedFiles);
      if (entry.name === "asr") {
        expect(JSON.parse(readFileSync(join(directory, "transcripts.json"), "utf8"))).toEqual([
          "First line",
          "Second line\n",
        ]);
        if (format === "json")
          expect(quiet.data).toMatchObject({
            results: ["First line", "Second line\n"],
            request_id: "asr-request",
            preserved: "service metadata",
          });
        else expect(quiet.stdout).toBe("First line\nSecond line\n");
      } else {
        const saved = quiet.data.saved;
        const paths: string[] = Array.isArray(saved)
          ? saved
          : saved
            ? [saved]
            : quiet.data.videos.map((video: { saved: string }) => video.saved);
        expect(paths).toHaveLength(expectedFiles);
        for (const path of paths) expect(readFileSync(path, "utf8")).toBe("payload");
        if (entry.name === "video-explicit")
          expect(quiet.data).toMatchObject({
            task_id: "task-1",
            status: "SUCCEEDED",
            saved: join(directory, "video.mp4"),
          });
        if (entry.name.startsWith("video"))
          expect(normal.calls.some(([, args]) => args.task_id === "task-1")).toBe(true);
      }
    },
  );
  test(`${entry.name} auto tool errors keep one JSON error and close the session`, async () => {
    const result = await invoke(entry, "json", true, "tool");
    expect(result.exitCode).toBe(ExitCode.GENERAL);
    expect(result.stdout).toBe("");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].error.message).toContain("Original tool failure");
    expect(result.downloads).toBe(0);
    expect(result.closes).toBe(1);
  });
}

test.each(["task", "timeout", "download"] as const)(
  "video auto %s failure never emits an early result",
  async (failure) => {
    const result = await invoke(entries[6]!, "json", true, failure);
    expect(result.exitCode).toBe(failure === "timeout" ? ExitCode.TIMEOUT : ExitCode.GENERAL);
    expect(result.stdout).toBe("");
    expect(result.diagnostics).toHaveLength(1);
    if (failure === "task")
      expect(result.diagnostics[0].error.message).toBe("Original task failure");
    expect(result.closes).toBe(1);
  },
);
