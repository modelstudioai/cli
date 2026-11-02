import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import { buildSettings, Client, type AnyCommand, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import generate from "../../src/commands/image/generate.ts";
import edit from "../../src/commands/image/edit.ts";

let directory: string;
let server: Server;
let origin: string;
let scenario: "success" | "submit-error" | "task-failed" | "empty" | "download-error";
let requests: Array<{ method: string; path: string; body: unknown; async: boolean }>;
let legacyResults: boolean;
let submissions: number;
let downloads: number;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "bl-image-output-"));
  scenario = "success";
  requests = [];
  submissions = 0;
  downloads = 0;
  legacyResults = false;
  server = createServer(async (request, response) => {
    if (request.url?.startsWith("/files/")) {
      downloads++;
      if (scenario === "download-error") {
        response.writeHead(503).end("unavailable");
        return;
      }
      response.writeHead(200, { "content-length": "7" });
      response.write("pay");
      response.end("load");
      return;
    }
    let rawBody = "";
    for await (const chunk of request) rawBody += String(chunk);
    const asynchronous = request.headers["x-dashscope-async"] === "enable";
    requests.push({
      method: request.method!,
      path: request.url!,
      body: rawBody ? JSON.parse(rawBody) : undefined,
      async: asynchronous,
    });
    response.setHeader("content-type", "application/json");
    if (scenario === "submit-error") {
      response.writeHead(429).end(
        JSON.stringify({
          code: "ServiceLimit",
          message: "Original service failure",
          request_id: "request-test",
        }),
      );
      return;
    }
    if (request.method === "POST") {
      const submission = ++submissions;
      response.end(
        JSON.stringify({
          output: asynchronous
            ? { task_id: `task-${submission}` }
            : {
                choices:
                  scenario === "empty"
                    ? []
                    : [{ message: { content: [{ image: `${origin}/files/${submission}.png` }] } }],
              },
        }),
      );
      return;
    }
    const taskId = request.url!.split("/").at(-1)!;
    response.end(
      JSON.stringify({
        output: {
          task_id: taskId,
          task_status: scenario === "task-failed" ? "FAILED" : "SUCCEEDED",
          ...(scenario === "task-failed"
            ? { code: "TaskFailure", message: "Original task failure" }
            : legacyResults
              ? {
                  results:
                    scenario === "empty" ? [] : [{ url: `${origin}/files/${taskId.slice(5)}.png` }],
                }
              : {
                  choices:
                    scenario === "empty"
                      ? []
                      : [
                          {
                            message: {
                              content: [{ image: `${origin}/files/${taskId.slice(5)}.png` }],
                            },
                          },
                        ],
                }),
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback address");
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(directory, { recursive: true, force: true });
});

const commands = [
  { name: "generate", command: generate },
  { name: "edit", command: edit },
];
const modes = ["sync", "wait", "async"] as const;
const displays = (["text", "json"] as const).flatMap((format) =>
  [false, true].flatMap((verbose) => [false, true].map((tty) => ({ format, verbose, tty }))),
);

async function invoke(
  command: AnyCommand,
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
  const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
  const client = new Client({
    identity,
    settings,
    baseUrl: origin,
    apiCred: { token: "test-placeholder", baseUrl: origin, source: "flag" },
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    try {
      await command.run({
        flags,
        settings,
        localize,
        identity,
        client,
        output: reporter.output,
      } as Parameters<AnyCommand["run"]>[0]);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, exitCode };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    if (ttyDescriptor) Object.defineProperty(process.stderr, "isTTY", ttyDescriptor);
    else Reflect.deleteProperty(process.stderr, "isTTY");
  }
}

function flagsFor(name: string, mode: (typeof modes)[number], concurrent = 2) {
  return {
    prompt: "A quiet lake",
    image: [`${origin}/source.png`],
    model: mode === "sync" ? "qwen-image-3.0" : "wan2.6-t2i",
    async: mode === "async",
    concurrent,
    pollInterval: 0,
    outPrefix: "fixed",
    outDir: join(directory, "explicit"),
    ...(name === "generate" ? { seed: 42, watermark: false } : {}),
  };
}

for (const entry of commands) {
  for (const mode of modes) {
    test.each(displays)(
      `${entry.name}/${mode} preserves results and requests: $format verbose=$verbose tty=$tty`,
      async (display) => {
        const runs = [];
        for (const quiet of [false, true]) {
          submissions = 0;
          requests = [];
          downloads = 0;
          const result = await invoke(entry.command, flagsFor(entry.name, mode), {
            ...display,
            quiet,
          });
          expect(result.exitCode, result.stderr).toBe(0);
          const data =
            display.format === "json" ? JSON.parse(result.stdout) : parseYaml(result.stdout);
          if (mode === "async") {
            expect(data).toEqual({ task_ids: ["task-1", "task-2"] });
            expect(downloads).toBe(0);
            expect(requests).toHaveLength(2);
          } else {
            const saved = [1, 2].map((number) =>
              join(directory, "explicit", `fixed_00${number}.png`),
            );
            expect(data).toEqual({
              urls: [1, 2].map((number) => `${origin}/files/${number}.png`),
              saved,
              total: 2,
              ...(entry.name === "generate" && mode === "wait"
                ? { task_ids: ["task-1", "task-2"] }
                : {}),
            });
            for (const path of saved) expect(readFileSync(path, "utf8")).toBe("payload");
            expect(downloads).toBe(2);
            expect(requests).toHaveLength(mode === "wait" ? 4 : 2);
          }
          const submitted = requests.filter((request) => request.method === "POST");
          expect(submitted).toHaveLength(2);
          expect(submitted.every((request) => request.async === (mode !== "sync"))).toBe(true);
          expect(submitted[0]!.path).toBe(
            mode === "sync"
              ? "/api/v1/services/aigc/multimodal-generation/generation"
              : "/api/v1/services/aigc/image-generation/generation",
          );
          expect(submitted[0]!.body).toMatchObject({
            model: mode === "sync" ? "qwen-image-3.0" : "wan2.6-t2i",
            input: {
              messages: [
                { role: "user", content: expect.arrayContaining([{ text: "A quiet lake" }]) },
              ],
            },
          });
          if (display.format === "json") {
            const diagnostics = result.stderr.trim()
              ? result.stderr
                  .trim()
                  .split("\n")
                  .map((line) => JSON.parse(line))
              : [];
            expect(diagnostics.every((record) => record.debug)).toBe(true);
            expect(diagnostics.length > 0).toBe(display.verbose);
          } else {
            expect(result.stderr.includes("[Model:")).toBe(!quiet);
            expect(result.stderr.includes("[Concurrent: 2")).toBe(!quiet);
            expect(result.stderr.includes("\rDownloading")).toBe(
              !quiet && display.tty && mode !== "async",
            );
          }
          runs.push({ stdout: result.stdout, requests: [...requests] });
        }
        expect(runs[1]).toEqual(runs[0]);
      },
    );
  }
}

for (const entry of commands) {
  test.each(["sync", "wait"] as const)(
    `${entry.name}/%s single image retains metadata and default output directory`,
    async (mode) => {
      const flags = flagsFor(entry.name, mode, 1);
      const { outDir: _outDir, ...defaultFlags } = flags;
      const result = await invoke(entry.command, defaultFlags, { format: "json", quiet: true });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        urls: [`${origin}/files/1.png`],
        saved: [join(directory, "images", "fixed.png")],
        total: 1,
        ...(entry.name === "generate" && mode === "wait" ? { task_id: "task-1" } : {}),
      });
    },
  );

  test(`${entry.name} retains the legacy task results response`, async () => {
    legacyResults = true;
    const result = await invoke(entry.command, flagsFor(entry.name, "wait", 1), {
      format: "json",
      quiet: true,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ urls: [`${origin}/files/1.png`], total: 1 });
    expect(downloads).toBe(1);
  });

  test.each(["submit-error", "task-failed", "empty", "download-error"] as const)(
    `${entry.name}/%s retains one terminal JSON error`,
    async (failure) => {
      scenario = failure;
      const mode = failure === "task-failed" ? "wait" : "sync";
      const result = await invoke(entry.command, flagsFor(entry.name, mode, 1), {
        format: "json",
        quiet: false,
        verbose: true,
        tty: true,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const records = result.stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const errors = records.filter((record) => record.error);
      expect(errors).toHaveLength(1);
      expect(records.every((record) => record.debug || record.error)).toBe(true);
      if (failure === "submit-error") {
        expect(errors[0].error).toMatchObject({
          message: "Original service failure",
          api_code: "ServiceLimit",
          request_id: "request-test",
          http_status: 429,
        });
      }
      if (failure === "task-failed")
        expect(errors[0].error.message).toContain("Original task failure");
      if (failure === "download-error") expect(errors[0].error.message).toContain("503");
      if (failure === "empty") expect(errors[0].error.message).toContain("no images");
    },
  );

  test(`${entry.name} localizes process info and retains TTY progress`, async () => {
    const result = await invoke(entry.command, flagsFor(entry.name, "sync", 1), {
      format: "text",
      quiet: false,
      chinese: true,
      tty: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("[模型：qwen-image-3.0]");
    expect(result.stderr).toContain("\rDownloading");
  });

  test(`${entry.name} dry-run preserves JSON quiet and input redaction`, async () => {
    const result = await invoke(
      entry.command,
      { ...flagsFor(entry.name, "sync"), image: ["data:image/png;base64,cGF5bG9hZA=="] },
      { format: "json", quiet: true, verbose: true, dryRun: true },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(requests).toEqual([]);
    expect(downloads).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "sync",
      request: { model: "qwen-image-3.0" },
    });
    expect(result.stdout).not.toContain("cGF5bG9hZA==");
  });
}
