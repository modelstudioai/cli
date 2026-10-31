import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import {
  buildSettings,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import generate from "../../src/commands/video/generate.ts";
import reference from "../../src/commands/video/ref.ts";
import edit from "../../src/commands/video/edit.ts";
import download from "../../src/commands/video/download.ts";
import taskGet from "../../src/commands/video/task-get.ts";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "bl-video-output-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

const generators = [
  { name: "generate", command: generate, flags: { prompt: "A quiet lake" } },
  {
    name: "reference",
    command: reference,
    flags: { prompt: "Image 1 moves", image: ["https://example.invalid/image.png"] },
  },
  {
    name: "edit",
    command: edit,
    flags: { prompt: "Change the background", video: "https://example.invalid/source.mp4" },
  },
];
const cases = [
  ...generators.flatMap((entry) =>
    (["explicit", "automatic", "async"] as const).map((mode) => ({ ...entry, mode })),
  ),
  { name: "download", command: download, flags: { taskId: "task-1", out: "" }, mode: "download" },
  { name: "task-get", command: taskGet, flags: { taskId: "task-1" }, mode: "query" },
];
const displayCases = (["text", "json"] as const).flatMap((format) =>
  [false, true].map((verbose) => ({ format, verbose })),
);

async function invoke(
  command: AnyCommand,
  flags: Record<string, unknown>,
  display: {
    format: "text" | "json";
    quiet: boolean;
    verbose: boolean;
    dryRun?: boolean;
    failedTask?: boolean;
  },
) {
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
  const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    env: {},
    file: { output_dir: directory, timeout: 1 },
    configPath: join(directory, "config.json"),
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
  const reporter = createOutputReporter({ settings, localize });
  let submissions = 0;
  const requestJson = vi.fn(
    async (request: { async?: boolean; path: string; method?: string; body?: unknown }) => {
      if (request.async) return { output: { task_id: `task-${++submissions}` } };
      const taskId = new URL(request.path, "https://api.invalid").pathname.split("/").at(-1);
      return {
        request_id: "request-test",
        output: {
          task_id: taskId,
          task_status: display.failedTask ? "FAILED" : "SUCCEEDED",
          video_url: `https://video.invalid/${taskId}.mp4`,
          ...(display.failedTask
            ? { code: "ServerFailure", message: "Original service failure" }
            : {}),
        },
      };
    },
  );
  const fetchMock = vi.spyOn(httpTransport, "fetch").mockImplementation(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("pay"));
            controller.enqueue(new TextEncoder().encode("load"));
            controller.close();
          },
        }),
        { headers: { "content-length": "7" } },
      ),
  );
  const context = {
    flags,
    settings,
    output: reporter.output,
    localize,
    identity: { binName: "bl", version: "test", clientName: "test", npmPackage: "test" },
    client: {
      requestJson,
      url: (path: string) => new URL(path, "https://api.invalid").href,
      uploadFile: async (url: string) => url,
      resolveImageInput: async (url: string) => url,
    },
  } as unknown as Parameters<AnyCommand["run"]>[0];
  let exitCode = 0;
  try {
    try {
      await command.run(context);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return {
      stdout,
      stderr,
      exitCode,
      data: stdout
        ? display.format === "json"
          ? JSON.parse(stdout)
          : parseYaml(stdout)
        : undefined,
      diagnostics:
        display.format === "json" && stderr
          ? stderr
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
          : [],
      requests: requestJson.mock.calls.map(([request]) => request),
      downloads: fetchMock.mock.calls.length,
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    fetchMock.mockRestore();
    if (ttyDescriptor) Object.defineProperty(process.stderr, "isTTY", ttyDescriptor);
    else Reflect.deleteProperty(process.stderr, "isTTY");
  }
}

for (const entry of cases) {
  test.each(displayCases)(
    `${entry.name}/${entry.mode} preserves results and requests with $format verbose=$verbose`,
    async ({ format, verbose }) => {
      const destination = join(directory, "explicit.mp4");
      const flags: Record<string, unknown> = { ...entry.flags, pollInterval: 0 };
      if (entry.mode === "explicit") flags.download = destination;
      if (entry.mode === "download") flags.out = destination;
      if (entry.mode === "automatic" || entry.mode === "async") flags.concurrent = 2;
      if (entry.mode === "async") flags.async = true;
      const runs = [];
      for (const quiet of [false, true]) {
        const result = await invoke(entry.command, flags, { format, quiet, verbose });
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.diagnostics).toEqual([]);
        if (quiet || format === "json") expect(result.stderr).toBe("");
        if (!quiet && format === "text" && entry.mode !== "download" && entry.mode !== "query") {
          expect(result.stderr).toContain("[Model:");
          if (flags.concurrent === 2) expect(result.stderr).toContain("[Concurrent: 2 tasks]");
          if (entry.name === "reference")
            expect(result.stderr).toContain("Reference-to-video typically takes");
          if (entry.name === "edit")
            expect(result.stderr).toContain("Video editing typically takes");
        }
        if (entry.mode === "explicit") {
          expect(result.data).toEqual({
            task_id: "task-1",
            video_url: "https://video.invalid/task-1.mp4",
            status: "SUCCEEDED",
            saved: destination,
            size: "7 B",
          });
          expect(readFileSync(destination, "utf8")).toBe("payload");
        } else if (entry.mode === "download") {
          expect(result.data).toEqual({ saved: destination, size: "7 B" });
          expect(readFileSync(destination, "utf8")).toBe("payload");
          if (format === "text" && !quiet) {
            expect(result.stderr).toContain("\r");
            expect(result.stderr.match(/\n/g)).toHaveLength(1);
          }
        } else if (entry.mode === "async") {
          expect(result.data).toEqual({ task_ids: ["task-1", "task-2"] });
          expect(result.downloads).toBe(0);
          expect(result.requests).toHaveLength(2);
        } else if (entry.mode === "automatic") {
          expect(result.data).toEqual({
            total: 2,
            videos: expect.arrayContaining(
              [1, 2].map((number) => ({
                task_id: `task-${number}`,
                video_url: `https://video.invalid/task-${number}.mp4`,
                saved: join(directory, "videos", `task-${number}.mp4`),
              })),
            ),
          });
          expect(result.data.videos).toHaveLength(2);
          expect(result.downloads).toBe(2);
        } else {
          expect(result.data).toEqual({
            task_id: "task-1",
            task_status: "SUCCEEDED",
            video_url: "https://video.invalid/task-1.mp4",
            request_id: "request-test",
          });
        }
        runs.push(result);
      }
      expect(runs[1]!.requests).toEqual(runs[0]!.requests);
    },
  );
}

test("querying a FAILED task preserves service fields and still succeeds with JSON quiet", async () => {
  const result = await invoke(
    taskGet,
    { taskId: "task-1" },
    { format: "json", quiet: true, verbose: true, failedTask: true },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.data).toMatchObject({
    task_status: "FAILED",
    code: "ServerFailure",
    message: "Original service failure",
    request_id: "request-test",
  });
});

test.each(generators)(
  "$name polling failure retains a single structured error",
  async ({ command, flags }) => {
    const result = await invoke(
      command,
      { ...flags, concurrent: 2, pollInterval: 0 },
      { format: "json", quiet: false, verbose: false, failedTask: true },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].error.message).toContain("Original service failure");
  },
);

test.each([
  ...generators,
  { name: "download", command: download, flags: { taskId: "task-1", out: "preview.mp4" } },
  { name: "task-get", command: taskGet, flags: { taskId: "task-1" } },
])(
  "$name dry-run remains JSON with quiet and does not submit or download",
  async ({ command, flags }) => {
    const result = await invoke(command, flags, {
      format: "json",
      quiet: true,
      verbose: true,
      dryRun: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.data).toBeTypeOf("object");
    expect(result.requests).toEqual([]);
    expect(result.downloads).toBe(0);
    expect(result.stderr).toBe("");
  },
);
