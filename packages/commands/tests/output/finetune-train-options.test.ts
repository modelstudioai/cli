import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  MODEL_LIST_API,
  MODEL_TRAIN_OPTIONS_API,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
import finetuneParams from "../../src/commands/finetune/params.ts";
import finetuneTrainOptions from "../../src/commands/finetune/train-options.ts";
import { finetuneTextCreate } from "../../src/commands/finetune/create.ts";

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

// Trainable-catalog entries. qwen3-8b reports cpt=false here while the training
// API accepts cpt for it, which is why only model existence is ever taken from
// the catalog.
const CATALOG_MODELS = [
  { model: "qwen3-8b", supports: { sft: true, dpo: true, cpt: false } },
  { model: DYNAMIC_MODEL, supports: { sft: true, dpo: true, cpt: true } },
];

let isolated: ReturnType<typeof enterIsolatedHome>;
let schemaQueries: URLSearchParams[];
let consoleApis: string[];
let consoleFailure: Error | undefined;
let catalogQueries: string[];
let catalogAuth: Array<string | null>;
let catalogFailure: Error | undefined;

beforeEach(() => {
  isolated = enterIsolatedHome();
  schemaQueries = [];
  consoleApis = [];
  consoleFailure = undefined;
  catalogQueries = [];
  catalogAuth = [];
  catalogFailure = undefined;
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected unmocked HTTP"));
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    // Console gateway: form-encoded POST carrying the zelda API name.
    if (typeof init?.body === "string") {
      const form = new URLSearchParams(init.body);
      const params = JSON.parse(form.get("params")!) as {
        Api: string;
        Data: { input?: { models?: string[]; name?: string } };
      };
      if (consoleFailure) throw consoleFailure;
      // Public trainable catalog, queried without a console token.
      if (params.Api === MODEL_LIST_API) {
        const name = params.Data.input?.name ?? "";
        catalogQueries.push(name);
        catalogAuth.push(new Headers(init.headers).get("Authorization"));
        if (catalogFailure) throw catalogFailure;
        const list = CATALOG_MODELS.filter((entry) => entry.model === name);
        return Response.json({
          code: "200",
          successResponse: true,
          data: {
            success: true,
            DataV2: { ret: ["SUCCESS::ok"], data: { total: list.length, list, success: true } },
          },
        });
      }
      if (params.Api !== MODEL_TRAIN_OPTIONS_API) {
        throw new Error(`Unexpected console API: ${params.Api}`);
      }
      consoleApis.push(params.Api);
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
    // DashScope OpenAPI: the hyper-parameter schema GET.
    if (url.pathname === "/api/v1/fine-tunes/fine-tunes-params") {
      schemaQueries.push(url.searchParams);
      return Response.json({
        output: {
          hyper_params: [
            {
              name: "batch_size",
              type: "int",
              recommend_value: "32",
              range: [1, 512],
              step: 1,
              editable: true,
            },
            { name: "modality", type: "string", support_values: ["vision"], editable: true },
            {
              name: "reasoning_mode",
              type: "string",
              support_values: ["instruct", "thinking"],
              editable: true,
            },
          ],
        },
      });
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

async function invoke(
  command: AnyCommand,
  flags: Record<string, unknown>,
  options: { dryRun?: boolean; withConsole?: boolean; language?: "en-US" | "zh-CN" } = {},
) {
  let stdout = "";
  let stderr = "";
  const language = options.language ?? "en-US";
  const settings = buildSettings({
    flags: { output: "json", dryRun: options.dryRun, ...flags },
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
    ...(options.withConsole === false
      ? {}
      : {
          consoleCred: {
            token: "fixture-console-token",
            source: "flag" as const,
            region: "cn-beijing",
            site: "domestic" as const,
            switchAgent: 111,
          },
        }),
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

function datasetPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "bl-train-options-"));
  const path = join(dir, "train.jsonl");
  writeFileSync(
    path,
    `${JSON.stringify({
      messages: [
        { role: "user", content: "问" },
        { role: "assistant", content: "答" },
      ],
    })}\n`,
  );
  return path;
}

test("params completes omitted train options from the model defaults", async () => {
  const { stdout, exitCode } = await invoke(finetuneParams, { baseModel: DYNAMIC_MODEL });
  expect(exitCode).toBe(0);
  expect(consoleApis).toEqual([MODEL_TRAIN_OPTIONS_API]);
  expect(schemaQueries).toHaveLength(1);
  expect(schemaQueries[0].get("hyper_parameters")).toBe(
    JSON.stringify({ modality: "vision", reasoning_mode: "instruct" }),
  );
  const parsed = JSON.parse(stdout) as { precheck: { performed: boolean } };
  expect(parsed.precheck.performed).toBe(true);
});

test("params rejects an unsupported train-option value before the schema query", async () => {
  const { stderr, exitCode } = await invoke(finetuneParams, {
    baseModel: DYNAMIC_MODEL,
    modality: "text",
  });
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/Unsupported value|不受支持/);
  expect(schemaQueries).toHaveLength(0);
});

test("params rejects a combination outside supportedCombinations", async () => {
  const { stderr, exitCode } = await invoke(finetuneParams, {
    baseModel: DYNAMIC_MODEL,
    reasoningMode: "thinking",
  });
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/Invalid train-options combination|组合不合法/);
  expect(stderr).toMatch(/modality=vision\+reasoning_mode=instruct/);
  expect(schemaQueries).toHaveLength(0);
});

test("params rejects train-option flags on a model without dynamic options", async () => {
  const { stderr, exitCode } = await invoke(finetuneParams, {
    baseModel: "qwen3-8b",
    modality: "vision",
  });
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/no dynamic train options|未配置动态训练选项/);
  expect(schemaQueries).toHaveLength(0);
});

test("params degrades to a warning and passes options through when the console fails", async () => {
  consoleFailure = new Error("Console session is not logged in or has expired.");
  const { stdout, stderr, exitCode } = await invoke(finetuneParams, {
    baseModel: DYNAMIC_MODEL,
    modality: "vision",
    reasoningMode: "instruct",
  });
  expect(exitCode).toBe(0);
  expect(stderr).toMatch(/finetune\.train_options_precheck_skipped/);
  expect(schemaQueries[0].get("hyper_parameters")).toBe(
    JSON.stringify({ modality: "vision", reasoning_mode: "instruct" }),
  );
  const parsed = JSON.parse(stdout) as { precheck: { performed: boolean; reason: string } };
  expect(parsed.precheck).toEqual({ performed: false, reason: "console-unavailable" });
});

test("create dry-run completes defaults so dynamic-option models work without flags", async () => {
  const { stdout, exitCode } = await invoke(
    finetuneTextCreate,
    { baseModel: DYNAMIC_MODEL, datasets: datasetPath(), trainingType: "cpt" },
    { dryRun: true },
  );
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout) as {
    body: { hyper_parameters: Record<string, unknown> };
  };
  expect(parsed.body.hyper_parameters.modality).toBe("vision");
  expect(parsed.body.hyper_parameters.reasoning_mode).toBe("instruct");
  expect(schemaQueries[0].get("hyper_parameters")).toBe(
    JSON.stringify({ modality: "vision", reasoning_mode: "instruct" }),
  );
});

test("create rejects an invalid combination before the schema query", async () => {
  const { stderr, exitCode } = await invoke(
    finetuneTextCreate,
    {
      baseModel: DYNAMIC_MODEL,
      datasets: datasetPath(),
      trainingType: "cpt",
      reasoningMode: "thinking",
    },
    { dryRun: true },
  );
  expect(exitCode).toBe(2);
  expect(stderr).toMatch(/Invalid train-options combination|组合不合法/);
  expect(schemaQueries).toHaveLength(0);
});

test("create degrades silently to the hyper-parameter channel without a console session", async () => {
  const { stdout, exitCode } = await invoke(
    finetuneTextCreate,
    {
      baseModel: DYNAMIC_MODEL,
      datasets: datasetPath(),
      trainingType: "cpt",
      modality: "vision",
      reasoningMode: "instruct",
    },
    { dryRun: true, withConsole: false },
  );
  expect(exitCode).toBe(0);
  expect(consoleApis).toHaveLength(0);
  const parsed = JSON.parse(stdout) as {
    body: { hyper_parameters: Record<string, unknown> };
  };
  expect(parsed.body.hyper_parameters.modality).toBe("vision");
});

test("train-options command returns the console configuration verbatim", async () => {
  const { stdout, exitCode } = await invoke(finetuneTrainOptions, {
    baseModel: DYNAMIC_MODEL,
    trainingType: "cpt",
  });
  expect(exitCode).toBe(0);
  expect(consoleApis).toEqual([MODEL_TRAIN_OPTIONS_API]);
  const parsed = JSON.parse(stdout) as {
    model: string;
    training_type: string;
    status: string;
    training_options: { defaults: Record<string, string>; supportedCombinations: unknown[] };
  };
  expect(parsed.model).toBe(DYNAMIC_MODEL);
  expect(parsed.training_type).toBe("cpt");
  expect(parsed.status).toBe("configured");
  expect(parsed.training_options.defaults).toEqual({
    modality: "vision",
    reasoning_mode: "instruct",
  });
  expect(parsed.training_options.supportedCombinations).toHaveLength(1);
  expect(catalogQueries).toEqual([]);
});

test.each(["sft", "cpt"])(
  "train-options command reports not_configured once the catalog confirms the model (%s)",
  async (trainingType) => {
    const { stdout, exitCode } = await invoke(finetuneTrainOptions, {
      baseModel: "qwen3-8b",
      trainingType,
    });
    expect(exitCode).toBe(0);
    expect(consoleApis).toEqual([MODEL_TRAIN_OPTIONS_API]);
    // The catalog check runs after the console call and stays anonymous.
    expect(catalogQueries).toEqual(["qwen3-8b"]);
    expect(catalogAuth).toEqual([null]);
    const parsed = JSON.parse(stdout) as { status: string; training_options: unknown };
    expect(parsed.status).toBe("not_configured");
    expect(parsed.training_options).toBeNull();
  },
);

test("train-options command fails with a usage error for a model missing from the catalog", async () => {
  const { stdout, stderr, exitCode } = await invoke(finetuneTrainOptions, {
    baseModel: "qwen3-8b-typo",
  });
  expect(exitCode).toBe(2);
  expect(stdout).toBe("");
  const parsed = JSON.parse(stderr) as { error: { code: number; message: string; hint: string } };
  expect(parsed.error.code).toBe(2);
  expect(parsed.error.message).toBe(
    'No trainable base model named "qwen3-8b-typo" was found in the model catalog, and it has no dynamic train options.',
  );
  expect(parsed.error.hint).toBe(
    "Check the model id with finetune capability --base-model qwen3-8b-typo.",
  );
});

test("train-options command degrades to unverified when the catalog lookup fails", async () => {
  catalogFailure = new Error("Console CLI gateway failed: HTTP 503 Service Unavailable");
  const { stdout, stderr, exitCode } = await invoke(finetuneTrainOptions, {
    baseModel: "qwen3-8b",
  });
  expect(exitCode).toBe(0);
  expect(stderr).toMatch(/TRAINING_CAPABILITY_LOOKUP_FAILED/);
  expect(stderr).toMatch(/HTTP 503/);
  const parsed = JSON.parse(stdout) as { status: string; training_options: unknown };
  expect(parsed.status).toBe("unverified");
  expect(parsed.training_options).toBeNull();

  const localized = await invoke(
    finetuneTrainOptions,
    { baseModel: "qwen3-8b", output: "text" },
    { language: "zh-CN" },
  );
  expect(localized.exitCode).toBe(0);
  expect(localized.stderr).toMatch(/模型目录查询失败/);
  expect(localized.stdout).toMatch(/无法在模型目录中确认该模型存在/);
});

test.each([
  { label: "not_configured", baseModel: "qwen3-8b", exitCode: 0, pattern: /未配置动态训练选项/ },
  {
    label: "an unknown model",
    baseModel: "qwen3-8b-typo",
    exitCode: 2,
    pattern: /模型目录中未找到名为 "qwen3-8b-typo"/,
  },
])(
  "train-options command localizes the $label text output",
  async ({ baseModel, exitCode, pattern }) => {
    const {
      stdout,
      stderr,
      exitCode: actual,
    } = await invoke(finetuneTrainOptions, { baseModel, output: "text" }, { language: "zh-CN" });
    expect(actual).toBe(exitCode);
    // Results go to stdout, errors to stderr.
    expect(exitCode === 0 ? stdout : stderr).toMatch(pattern);
  },
);
