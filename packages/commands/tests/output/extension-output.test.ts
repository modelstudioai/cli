import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
import install from "../../src/commands/plugin/install.ts";
import link from "../../src/commands/plugin/link.ts";
import list from "../../src/commands/plugin/list.ts";
import remove from "../../src/commands/plugin/remove.ts";
import run from "../../src/commands/pipeline/run.ts";
import validate from "../../src/commands/pipeline/validate.ts";

const matrix = (["text", "json"] as const).flatMap((output) =>
  [false, true].flatMap((quiet) => [false, true].map((verbose) => ({ output, quiet, verbose }))),
);
const identity = { binName: "bl", version: "0.0.0", clientName: "test", npmPackage: "test" };
const localized = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const paths: string[] = [];
let isolation: ReturnType<typeof enterIsolatedHome>;
beforeEach(() => {
  isolation = enterIsolatedHome();
  vi.stubEnv("DASHSCOPE_API_KEY", "fixture-key");
  vi.stubEnv("DASHSCOPE_BASE_URL", "https://example.test");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  isolation.restore();
  process.exitCode = 0;
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
function capture(display: (typeof matrix)[number]) {
  let stdout = "";
  let stderr = "";
  const settings = { ...buildSettings({ flags: {}, env: {}, file: {} }), ...display };
  const reporter = createOutputReporter({
    settings,
    localize: localized,
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
  return { settings, reporter, stdout: () => stdout, stderr: () => stderr };
}
async function pipelineFile(failed = false) {
  const root = await mkdtemp(join(tmpdir(), "extension-output-"));
  paths.push(root);
  const path = join(root, "pipeline.json");
  await writeFile(
    path,
    JSON.stringify({
      version: "workflow/v1",
      steps: [
        {
          id: "first",
          type: "script/js",
          input: { code: "return {task_id: 'accepted-fixture', values: [false, 0, null, []]};" },
        },
        {
          id: "second",
          type: "logic/assert",
          dependsOn: ["first"],
          input: { condition: !failed, message: "fixture failure" },
        },
      ],
    }),
  );
  return path;
}
for (const [name, command, flags, expected] of [
  [
    "install",
    install,
    { package: "@fixture/pack" },
    { installed: { name: "@fixture/pack", commands: [] } },
  ],
  ["link", link, { path: "/fixture" }, { linked: { name: "@fixture/pack", commands: [] } }],
  ["remove", remove, { name: "@fixture/pack" }, { removed: "@fixture/pack" }],
  ["list", list, {}, { command_packs: [] }],
] as const) {
  test.each(matrix)(
    `${name} complete result $output quiet=$quiet verbose=$verbose`,
    async (display) => {
      const streams = capture(display);
      await (command as AnyCommand).run({
        identity,
        settings: streams.settings,
        flags,
        output: streams.reporter.output,
        localize: localized,
        commandPacks: {
          install: async () => ({ name: "@fixture/pack", commands: [] }),
          link: async () => ({ name: "@fixture/pack", commands: [] }),
          remove: async () => {},
          list: async () => [],
        },
      } as never);
      if (display.output === "json") expect(JSON.parse(streams.stdout())).toEqual(expected);
      else expect(streams.stdout()).not.toBe("");
      expect(streams.stderr()).toBe("");
    },
  );
}
test.each(matrix)("pipeline report $output quiet=$quiet verbose=$verbose", async (display) => {
  const streams = capture(display);
  const path = await pipelineFile();
  await run.run({
    identity,
    settings: streams.settings,
    flags: { file: path },
    output: streams.reporter.output,
    localize: localized,
  } as never);
  if (display.output === "json") {
    const report = JSON.parse(streams.stdout());
    expect(report.status).toBe("succeeded");
    expect(report.steps[0].output.data).toEqual({
      task_id: "accepted-fixture",
      values: [false, 0, null, []],
    });
    const diagnostics = streams
      .stderr()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(diagnostics.length > 0).toBe(display.verbose);
    for (const diagnostic of diagnostics) expect(diagnostic.debug).toBeDefined();
  } else
    expect(streams.stdout()).toBe(
      "\nPipeline succeeded [+]\n\n  [+] first (script/js) — succeeded\n  [+] second (logic/assert) — succeeded\n\n",
    );
});
test("failed pipeline retains prior outputs then throws once for runtime", async () => {
  const streams = capture({ output: "json", quiet: true, verbose: false });
  const path = await pipelineFile(true);
  await expect(
    run.run({
      identity,
      settings: streams.settings,
      flags: { file: path },
      output: streams.reporter.output,
      localize: localized,
    } as never),
  ).rejects.toThrow();
  const report = JSON.parse(streams.stdout());
  expect(report.status).toBe("failed");
  expect(report.steps[0].output.data.task_id).toBe("accepted-fixture");
  expect(report.steps[1].error.message).toBe("fixture failure");
  expect(streams.stderr()).toBe("");
  expect(process.exitCode).toBe(0);
});
test("invalid validation retains structured report and throws once", async () => {
  const streams = capture({ output: "json", quiet: true, verbose: false });
  const root = await mkdtemp(join(tmpdir(), "extension-invalid-"));
  paths.push(root);
  const path = join(root, "invalid.json");
  await writeFile(path, JSON.stringify({ version: "invalid", steps: [] }));
  await expect(
    validate.run({
      identity,
      settings: streams.settings,
      flags: { file: path },
      output: streams.reporter.output,
      localize: localized,
    } as never),
  ).rejects.toThrow();
  expect(JSON.parse(streams.stdout())).toMatchObject({ valid: false });
  expect(streams.stderr()).toBe("");
  expect(process.exitCode).toBe(0);
});

test.each(["en-US", "zh-CN"] as const)(
  "JSON lifecycle conflict rejects before file reads (%s)",
  async (language) => {
    const streams = capture({ output: "json", quiet: true, verbose: false });
    const localize = (text: LocalizedText) => (typeof text === "string" ? text : text[language]);
    await expect(
      run.run({
        identity,
        settings: streams.settings,
        flags: { file: "/does/not/exist", events: "jsonl" },
        output: streams.reporter.output,
        localize,
      } as never),
    ).rejects.toMatchObject({ exitCode: 2 });
    expect(streams.stdout()).toBe("");
  },
);

test.each(matrix)(
  "pipeline HTTP diagnostics $output quiet=$quiet verbose=$verbose",
  async (display) => {
    const streams = capture(display);
    const root = await mkdtemp(join(tmpdir(), "extension-http-"));
    paths.push(root);
    const path = join(root, "pipeline.json");
    await writeFile(
      path,
      JSON.stringify({
        version: "workflow/v1",
        steps: [
          {
            id: "chat",
            type: "text/chat",
            input: { message: "fixture input", model: "fixture-model" },
          },
        ],
      }),
    );
    const payload = {
      id: "fixture-response",
      choices: [{ message: { role: "assistant", content: "fixture answer" } }],
      extra: [false, 0, null, []],
    };
    const fetch = vi.spyOn(httpTransport, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json", "x-request-id": "fixture-request" },
      }),
    );
    await run.run({
      identity,
      settings: streams.settings,
      flags: { file: path },
      output: streams.reporter.output,
      localize: localized,
    } as never);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]!;
    expect(request[0]).toContain("/chat/completions");
    expect(JSON.parse(request[1]!.body as string)).toEqual({
      model: "fixture-model",
      messages: [{ role: "user", content: "fixture input" }],
      max_tokens: 4096,
      stream: false,
    });
    if (display.output === "json")
      expect(JSON.parse(streams.stdout()).steps[0].output.data).toEqual(payload);
    expect(streams.stderr().includes("HTTP request")).toBe(display.verbose);
    expect(streams.stderr().includes("HTTP response")).toBe(display.verbose);
    expect(streams.stderr()).not.toContain("fixture-key");
    expect(streams.stderr()).not.toContain("fixture input");
  },
);
