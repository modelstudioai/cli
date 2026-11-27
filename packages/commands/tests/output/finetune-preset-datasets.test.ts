import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  MODEL_TRAIN_OPTIONS_API,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
import finetunePresetDatasets from "../../src/commands/finetune/preset-datasets.ts";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const DYNAMIC_MODEL = "qwen3.6-plus-base-2026-04-02";

const dynamicOptions = {
  enabled: true,
  optionKeys: ["modality", "reasoning_mode"],
  optionDefinitions: [
    { name: "modality", supportValues: ["vision"], required: true, editable: false },
    {
      name: "reasoning_mode",
      supportValues: ["instruct", "thinking"],
      required: true,
      editable: true,
    },
  ],
  defaults: { modality: "vision", reasoning_mode: "instruct" },
  supportedCombinations: [{ modality: "vision", reasoning_mode: "instruct" }],
};

// dataset_code keeps its server casing and the response keeps server field names.
const presetDatasets = [
  { dataset_code: "mix_V2", dataset_title: "Mix v2", dataset_desc: "General mix." },
  { dataset_code: "bare_Set", dataset_title: "Bare set" },
];

let isolated: ReturnType<typeof enterIsolatedHome>;
let presetQueries: { search: URLSearchParams; headers: Headers; method: string }[];
let consoleApis: string[];
let serverOutput: unknown;
let serverError: { status: number; body: unknown } | undefined;
let consoleFailure: Error | undefined;

beforeEach(() => {
  isolated = enterIsolatedHome();
  presetQueries = [];
  consoleApis = [];
  serverOutput = presetDatasets;
  serverError = undefined;
  consoleFailure = undefined;
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected unmocked HTTP"));
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    // Console gateway: form-encoded POST carrying the zelda API name.
    if (typeof init?.body === "string") {
      const form = new URLSearchParams(init.body);
      const params = JSON.parse(form.get("params")!) as {
        Api: string;
        Data: { input?: { models?: string[] } };
      };
      consoleApis.push(params.Api);
      if (consoleFailure) throw consoleFailure;
      if (params.Api !== MODEL_TRAIN_OPTIONS_API) {
        throw new Error(`Unexpected console API: ${params.Api}`);
      }
      const model = params.Data.input?.models?.[0] ?? "";
      const entries = model === DYNAMIC_MODEL ? [{ model, trainingOptions: dynamicOptions }] : [];
      return Response.json({
        code: "200",
        successResponse: true,
        data: {
          success: true,
          DataV2: { ret: ["SUCCESS::ok"], data: { code: "200", data: entries, success: true } },
        },
      });
    }
    // DashScope OpenAPI: the preset-datasets GET.
    if (url.pathname === "/api/v1/fine-tunes/preset-datasets") {
      presetQueries.push({
        search: url.searchParams,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
      });
      if (serverError) return Response.json(serverError.body, { status: serverError.status });
      return Response.json({ request_id: "req-preset", output: serverOutput });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
});

afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    isolated.restore();
  }
});

async function invoke(command: AnyCommand, flags: Record<string, unknown>) {
  let stdout = "";
  let stderr = "";
  const language = "en-US";
  const settings = buildSettings({
    flags: { output: "json", ...flags },
    file: { language, telemetry: false },
    env: {},
    configPath: join(isolated.configDir, "config.json"),
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text[language]);
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  });
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://api.example.invalid",
    apiCred: {
      token: "fixture-api-key",
      baseUrl: "https://api.example.invalid",
      source: "flag" as const,
    },
    consoleCred: {
      token: "fixture-console-token",
      source: "flag" as const,
      region: "cn-beijing",
      site: "domestic" as const,
      switchAgent: 111,
    },
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    await command.run({
      flags,
      settings,
      identity,
      localize,
      client,
      output: reporter.output,
    } as never);
  } catch (error) {
    exitCode = reporter.error(error);
  }
  return { stdout, stderr, exitCode };
}

/** JSON diagnostics the reporter wrote to stderr, one object per line. */
function diagnostics(stderr: string): Record<string, unknown>[] {
  return stderr
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("returns the server payload verbatim plus precheck metadata", async () => {
  const { stdout, exitCode } = await invoke(finetunePresetDatasets, { baseModel: "qwen3-8b" });
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout)).toEqual({
    request_id: "req-preset",
    output: presetDatasets,
    precheck: { performed: true, dynamic_options: false },
  });
  expect(consoleApis).toEqual([MODEL_TRAIN_OPTIONS_API]);
  expect(presetQueries).toHaveLength(1);
  expect(presetQueries[0].method).toBe("GET");
  expect(Object.fromEntries(presetQueries[0].search)).toEqual({
    input_model: "qwen3-8b",
    training_type: "efficient_sft",
  });
  expect(presetQueries[0].headers.get("authorization")).toBe("Bearer fixture-api-key");
  expect(presetQueries[0].headers.get("X-DashScope-WorkSpace")).toBeNull();
});

test("completes omitted train options from the model defaults", async () => {
  const { stdout, exitCode } = await invoke(finetunePresetDatasets, { baseModel: DYNAMIC_MODEL });
  expect(exitCode).toBe(0);
  expect(presetQueries[0].search.get("hyper_parameters")).toBe(
    JSON.stringify({ modality: "vision", reasoning_mode: "instruct" }),
  );
  const parsed = JSON.parse(stdout) as { precheck: unknown };
  expect(parsed.precheck).toEqual({ performed: true, dynamic_options: true });
});

test("sends the version, the mapped training type and the workspace header", async () => {
  const { exitCode } = await invoke(finetunePresetDatasets, {
    baseModel: "qwen3-8b",
    trainingType: "dpo",
    modelVersion: "v1",
    workspaceId: "ws-123",
  });
  expect(exitCode).toBe(0);
  expect(Object.fromEntries(presetQueries[0].search)).toEqual({
    input_model: "qwen3-8b",
    training_type: "dpo_full",
    version: "v1",
  });
  expect(presetQueries[0].headers.get("X-DashScope-WorkSpace")).toBe("ws-123");
});

test("rejects a combination outside supportedCombinations before the query", async () => {
  const { stderr, exitCode } = await invoke(finetunePresetDatasets, {
    baseModel: DYNAMIC_MODEL,
    reasoningMode: "thinking",
  });
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/Invalid train-options combination|组合不合法/);
  expect(presetQueries).toHaveLength(0);
});

test("text output prints two lines per dataset", async () => {
  const { stdout, exitCode } = await invoke(finetunePresetDatasets, {
    baseModel: "qwen3-8b",
    output: "text",
  });
  expect(exitCode).toBe(0);
  expect(stdout.trimEnd().split("\n")).toEqual([
    "mix_V2  Mix v2",
    "    General mix.",
    "bare_Set  Bare set",
  ]);
});

test("an empty list is a success in both output formats", async () => {
  serverOutput = [];
  const asJson = await invoke(finetunePresetDatasets, {
    baseModel: "qwen3-8b",
    trainingType: "dpo",
  });
  expect(asJson.exitCode).toBe(0);
  expect(JSON.parse(asJson.stdout).output).toEqual([]);

  const asText = await invoke(finetunePresetDatasets, {
    baseModel: "qwen3-8b",
    trainingType: "dpo",
    output: "text",
  });
  expect(asText.exitCode).toBe(0);
  expect(asText.stdout).toMatch(/No preset datasets to mix for qwen3-8b \(dpo_full\)\./);
});

test("passes an HTTP error through with the server code, message and request id", async () => {
  serverError = {
    status: 401,
    body: { code: "InvalidApiKey", message: "original server error", request_id: "req-deny" },
  };
  const { stdout, stderr, exitCode } = await invoke(finetunePresetDatasets, {
    baseModel: "qwen3-8b",
  });
  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(diagnostics(stderr)[0].error).toMatchObject({
    message: "original server error",
    request_id: "req-deny",
    api_code: "InvalidApiKey",
    http_status: 401,
  });
});

test("degrades to a warning and passes options through when the console fails", async () => {
  consoleFailure = new Error("Console session is not logged in or has expired.");
  const { stdout, stderr, exitCode } = await invoke(finetunePresetDatasets, {
    baseModel: DYNAMIC_MODEL,
    modality: "vision",
    reasoningMode: "instruct",
  });
  expect(exitCode).toBe(0);
  expect(diagnostics(stderr)[0].warning).toMatchObject({
    code: "finetune.train_options_precheck_skipped",
  });
  expect(presetQueries[0].search.get("hyper_parameters")).toBe(
    JSON.stringify({ modality: "vision", reasoning_mode: "instruct" }),
  );
  const parsed = JSON.parse(stdout) as { precheck: unknown };
  expect(parsed.precheck).toEqual({ performed: false, reason: "console-unavailable" });
});
