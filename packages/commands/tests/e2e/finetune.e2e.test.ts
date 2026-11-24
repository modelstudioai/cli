import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "path";
import {
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
  e2eFixturesDir,
} from "./helpers.ts";
import { FINETUNE_ROUTES } from "./topic-routes.ts";

let schemaServer: Server;
let schemaOrigin = "";
/** Query of the most recent schema request, for protocol assertions. */
let lastSchemaQuery: URLSearchParams | null = null;

/** Vision-only dynamic-option base mirroring qwen3.6-plus-base-2026-04-02. */
const DYNAMIC_OPTION_MODEL = "qwen3.6-plus-base-2026-04-02";

function parameterSchema(
  inputModel: string,
  hyperParametersRaw: string | null,
): Array<Record<string, unknown>> {
  if (inputModel === DYNAMIC_OPTION_MODEL) {
    // Mirror the platform: dynamic-option models return an empty schema unless
    // hyper_parameters carries a legal option context (modality fixed vision).
    let options: Record<string, unknown> = {};
    try {
      options = hyperParametersRaw ? JSON.parse(hyperParametersRaw) : {};
    } catch {
      options = {};
    }
    if (options.modality !== "vision") return [];
    return [
      {
        name: "batch_size",
        type: "number",
        data_range: ["8", "8192"],
        step: 8,
        editable: true,
        defaultValue: "8",
      },
      { name: "n_epochs", type: "number", data_range: ["1", "200"], step: 1, editable: true },
      { name: "learning_rate", type: "input", editable: true },
      { name: "modality", type: "select", support_values: ["vision"], editable: true },
      {
        name: "reasoning_mode",
        type: "select",
        support_values: ["instruct", "thinking"],
        editable: true,
      },
    ];
  }
  if (inputModel.startsWith("decision-model")) {
    // Decision preview model: only the three documented knobs; batch_size
    // defaults to 1 within [1, 1024], n_epochs to 2 within [1, 200].
    return [
      {
        name: "batch_size",
        type: "number",
        data_range: ["1", "1024"],
        step: 1,
        editable: true,
        defaultValue: "1",
      },
      {
        name: "n_epochs",
        type: "number",
        data_range: ["1", "200"],
        step: 1,
        editable: true,
        defaultValue: "2",
      },
      { name: "learning_rate", type: "input", editable: true },
    ];
  }
  const videoModel = inputModel.startsWith("wan");
  return [
    {
      name: "batch_size",
      type: "number",
      data_range: videoModel ? ["1", "8192"] : ["8", "8192"],
      step: videoModel ? 1 : 8,
      editable: true,
      defaultValue: videoModel ? "1" : "8",
    },
    {
      name: "n_epochs",
      type: "number",
      data_range: ["1", "200"],
      step: 1,
      editable: true,
    },
    { name: "learning_rate", type: "input", editable: true },
    {
      name: "max_length",
      type: "intInputNumber",
      data_range: ["500", "65536"],
      editable: true,
    },
    {
      name: "eval_steps",
      type: "intInputNumber",
      data_range: ["1", "2147483647"],
      editable: true,
    },
    {
      name: "lora_alpha",
      type: "select",
      support_values: ["16", "32", "64", "128"],
      editable: true,
    },
    {
      name: "lora_dropout",
      type: "floatInputNumber",
      data_range: ["0", "0.2"],
      left_range: "exclude",
      right_range: "exclude",
      editable: true,
    },
    {
      name: "lora_rank",
      type: "select",
      support_values: ["8", "16", "32", "64"],
      editable: true,
    },
    {
      name: "lr_scheduler_type",
      type: "select",
      support_values: ["linear", "cosine"],
      editable: true,
    },
    {
      name: "save_strategy",
      type: "select",
      support_values: ["steps", "epoch"],
      editable: true,
    },
    {
      name: "save_total_limit",
      type: "number",
      data_range: ["1", "10"],
      step: 1,
      editable: true,
    },
    {
      name: "save_steps",
      type: "intInputNumber",
      data_range: ["1", "2147483647"],
      editable: true,
    },
    {
      name: "split",
      type: "floatInputNumber",
      data_range: ["0", "1"],
      left_range: "exclude",
      right_range: "exclude",
      editable: true,
    },
    {
      name: "max_split_val_dataset_sample",
      type: "intInputNumber",
      data_range: ["1", "2147483647"],
      editable: true,
    },
    {
      name: "data_augmentation",
      type: "select",
      support_values: ["true", "false"],
      editable: true,
    },
  ];
}

beforeAll(async () => {
  schemaServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname !== "/api/v1/fine-tunes/fine-tunes-params") {
      response.statusCode = 404;
      response.end('{"message":"unexpected path"}');
      return;
    }
    lastSchemaQuery = url.searchParams;
    response.end(
      JSON.stringify({
        output: {
          hyper_params: parameterSchema(
            url.searchParams.get("input_model") ?? "",
            url.searchParams.get("hyper_parameters"),
          ),
        },
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    schemaServer.once("error", reject);
    schemaServer.listen(0, "127.0.0.1", resolve);
  });
  const address = schemaServer.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
  schemaOrigin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  schemaServer.closeAllConnections();
  await new Promise<void>((resolve) => schemaServer.close(() => resolve()));
});

function runSchemaCommand(args: string[]) {
  return runCommandInProcess(FINETUNE_ROUTES, args, {
    DASHSCOPE_API_KEY: "offline-test-only",
    DASHSCOPE_BASE_URL: schemaOrigin,
    BAILIAN_WORKSPACE_ID: "",
    NODE_OPTIONS: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    NO_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    no_proxy: "",
    NODE_USE_ENV_PROXY: "",
  });
}

/**
 * Fine-tune E2E.
 *
 * The suite exercises command discovery, help text, and the `--dry-run`
 * structured-output path. Fine-tune create previews query a local model-specific
 * parameter schema but never upload data or submit a job.
 */

describe("e2e: finetune (schema-gated)", () => {
  test("finetune 列出子命令", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, ["finetune", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(
      /create|list|get|cancel|delete|logs|checkpoints|export|watch|capability/,
    );
  });

  test("finetune create --help 正常退出并展示必填项", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "text",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-model|--datasets/i);
  });

  test("finetune create --dry-run 构造 SFT 默认请求体", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      "file-aaa,file-bbb",
      "--validations",
      "file-ccc",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        model: string;
        training_file_ids: string[];
        validation_file_ids: string[];
        training_type: string;
        hyper_parameters: Record<string, unknown>;
      };
    }>(stdout);
    expect(data.action).toBe("finetune.create");
    expect(data.body.model).toBe("qwen3-8b");
    expect(data.body.training_file_ids).toEqual(["file-aaa", "file-bbb"]);
    expect(data.body.validation_file_ids).toEqual(["file-ccc"]);
    expect(data.body.training_type).toBe("efficient_sft");
    expect(data.body.hyper_parameters).toEqual({});
  });

  test("finetune create --dry-run 转发训练类型与超参", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      "file-aaa",
      "--training-type",
      "sft-lora",
      "--n-epochs",
      "5",
      "--batch-size",
      "32",
      "--learning-rate",
      "1.6e-5",
      "--max-length",
      "4096",
      "--model-name",
      "my-qwen-sft",
      "--suffix",
      "v1",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        training_type: string;
        model_name: string;
        finetuned_output_suffix: string;
        hyper_parameters: {
          n_epochs: number;
          batch_size: number;
          learning_rate: string;
          max_length: number;
        };
      };
    }>(stdout);
    expect(data.body.training_type).toBe("efficient_sft");
    expect(data.body.model_name).toBe("my-qwen-sft");
    expect(data.body.finetuned_output_suffix).toBe("v1");
    expect(data.body.hyper_parameters).toEqual({
      n_epochs: 5,
      batch_size: 32,
      learning_rate: "1.6e-5",
      max_length: 4096,
    });
  });

  test.each([
    ["sft", "sft"],
    ["sft-lora", "efficient_sft"],
    ["dpo", "dpo_full"],
    ["dpo-lora", "dpo_lora"],
    ["cpt", "cpt"],
  ])(
    "finetune create --training-type %s 经 profile 映射为 server 类型 %s",
    async (cliType, serverType) => {
      const { stdout, stderr, exitCode } = await runSchemaCommand([
        "finetune",
        "text",
        "create",
        "--base-model",
        "qwen3-8b",
        "--datasets",
        "file-aaa",
        "--training-type",
        cliType,
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ action: string; body: { training_type: string } }>(stdout);
      expect(data.action).toBe("finetune.create");
      expect(data.body.training_type).toBe(serverType);
    },
  );

  test("finetune create --training-type 拒绝不支持的训练类型值", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      "file-aaa",
      "--training-type",
      "cpt-lora",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
  });

  test("finetune text create --help 展示训练选项 flag", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "text",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--modality/);
    expect(stderr).toMatch(/--reasoning-mode/);
  });

  test("finetune create --dry-run 动态选项模型透传 modality/reasoning_mode 并作为 schema 查询上下文", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      DYNAMIC_OPTION_MODEL,
      "--datasets",
      "file-aaa",
      "--training-type",
      "cpt",
      "--modality",
      "vision",
      "--reasoning-mode",
      "instruct",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: {
        training_type: string;
        hyper_parameters: { modality: string; reasoning_mode: string };
      };
    }>(stdout);
    expect(data.body.training_type).toBe("cpt");
    expect(data.body.hyper_parameters.modality).toBe("vision");
    expect(data.body.hyper_parameters.reasoning_mode).toBe("instruct");
    // The schema query must carry the same options as hyper_parameters JSON.
    expect(lastSchemaQuery).not.toBeNull();
    expect(lastSchemaQuery?.get("training_type")).toBe("cpt");
    expect(lastSchemaQuery?.get("hyper_parameters")).toBe(
      JSON.stringify({ modality: "vision", reasoning_mode: "instruct" }),
    );
  });

  test("finetune create 动态选项模型缺 modality 时空 schema 闸门给出训练选项提示", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      DYNAMIC_OPTION_MODEL,
      "--datasets",
      "file-aaa",
      "--training-type",
      "cpt",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--modality/);
    expect(stderr).toMatch(/dynamic train options|动态训练选项/i);
  });

  test("finetune create 动态选项模型拒绝 schema 外的 modality 值", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      DYNAMIC_OPTION_MODEL,
      "--datasets",
      "file-aaa",
      "--training-type",
      "cpt",
      "--modality",
      "text",
      "--dry-run",
      "--output",
      "json",
    ]);
    // Empty schema (illegal context) hits the gate before override validation.
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--modality/);
  });

  test("finetune create 无动态选项模型拒绝 --modality（schema unsupported）", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      "file-aaa",
      "--modality",
      "vision",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/modality/);
    expect(stderr).toMatch(/not supported|不支持/i);
  });

  test("finetune create --modality 拒绝枚举外的值 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      "file-aaa",
      "--modality",
      "audio",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--modality/);
  });

  test("finetune create --dry-run 把本地路径标记为 pending 且不上传数据", async () => {
    const localPath = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      `${localPath},file-bbb`,
      "--validations",
      localPath,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { training_file_ids: string[]; validation_file_ids: string[] };
      pending_uploads: { field: string; path: string }[];
    }>(stdout);
    expect(data.action).toBe("finetune.create");
    // Local path preserved verbatim in the body (no upload in dry-run).
    expect(data.body.training_file_ids[0]).toBe(localPath);
    expect(data.body.training_file_ids[1]).toBe("file-bbb");
    expect(data.body.validation_file_ids).toEqual([localPath]);
    // Two pending uploads: training (1 local) + validation (1 local).
    expect(data.pending_uploads).toHaveLength(2);
    expect(data.pending_uploads.map((p) => p.field).sort()).toEqual(["datasets", "validations"]);
  });

  test("finetune create --datasets 为空时拒绝", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      " , ",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
  });

  test("finetune create 样本数 <= 有效 batch_size 时提交前失败且不上传", async () => {
    const localPath = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      localPath,
      "--batch-size",
      "32",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toMatch(/not greater than batch_size/i);
    expect(combined).not.toMatch(/Uploaded .* → file-/);
  });

  test("finetune create 按权威配置拒绝过小 batch_size 且不上传", async () => {
    const localPath = join(e2eFixturesDir, ".dataset-valid.jsonl");
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      localPath,
      "--batch-size",
      "1",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toMatch(/batch_size/i);
    expect(combined).not.toMatch(/Uploaded .* → file-/);
  });

  test.each([
    ["list", ["--status", "RUNNING"]],
    ["get", ["--job-id", "ft-xxx"]],
    ["checkpoints", ["--job-id", "ft-xxx"]],
    ["logs", ["--job-id", "ft-xxx", "--page-size", "50"]],
    ["export", ["--job-id", "ft-xxx", "--checkpoint", "ckpt-3", "--model-name", "m"]],
    ["cancel", ["--job-id", "ft-xxx"]],
    ["delete", ["--job-id", "ft-xxx"]],
    ["watch", ["--job-id", "ft-xxx"]],
    ["capability", ["--base-model", "qwen3-8b"]],
    ["params", ["--base-model", "qwen3-8b"]],
    ["metrics", ["--job-id", "ft-xxx"]],
  ])("finetune %s --dry-run 发出结构化动作", async (sub, extra) => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      sub,
      ...extra,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string }>(stdout);
    expect(data.action).toBe(`finetune.${sub}`);
  });

  test("finetune delete --help 展示 --yes", async () => {
    const { stderr, exitCode } = await runSchemaCommand(["finetune", "delete", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
  });

  test("finetune params --dry-run 映射训练类型并合并 modality/reasoning-mode", async () => {
    // sft-lora → efficient_sft at the interface boundary; --modality and
    // --reasoning-mode merge into one hyper_parameters JSON query string.
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "params",
      "--base-model",
      "qwen3-8b",
      "--modality",
      "text",
      "--reasoning-mode",
      "thinking",
      "--param-type",
      "hyper",
      "--mtu-spec-code",
      "MTU2",
      "--workspace-id",
      "ws-123",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      base_model: string;
      training_type: string;
      param_type: string;
      mtu_spec_code: string;
      hyper_parameters: string;
      workspace_id: string;
    }>(stdout);
    expect(data.action).toBe("finetune.params");
    expect(data.base_model).toBe("qwen3-8b");
    expect(data.training_type).toBe("efficient_sft");
    expect(data.param_type).toBe("hyper");
    expect(data.mtu_spec_code).toBe("MTU2");
    expect(data.hyper_parameters).toBe('{"modality":"text","reasoning_mode":"thinking"}');
    expect(data.workspace_id).toBe("ws-123");
  });

  test("finetune params --dry-run 显式训练类型按映射表转换", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "params",
      "--base-model",
      "qwen3-8b",
      "--training-type",
      "dpo",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ training_type: string }>(stdout);
    expect(data.training_type).toBe("dpo_full");
  });

  test("finetune params 非法训练类型退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "params",
      "--base-model",
      "qwen3-8b",
      "--training-type",
      "nope",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--training-type|nope/);
  });

  test("finetune params 非法 modality 枚举值退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "params",
      "--base-model",
      "qwen3-8b",
      "--modality",
      "audio",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--modality|modality|audio/i);
  });

  test("finetune params 缺少 --base-model 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand(["finetune", "params", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--base-model|Missing required argument/i);
  });

  test("finetune train-options --help 展示必填项与 console 凭证域 flag", async () => {
    const { stderr, exitCode } = await runSchemaCommand(["finetune", "train-options", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-model/);
    expect(stderr).toMatch(/--console-region/);
  });

  test("finetune train-options --dry-run 离线预览接口与映射后的训练类型", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "train-options",
      "--base-model",
      DYNAMIC_OPTION_MODEL,
      "--training-type",
      "sft-lora",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      api: string;
      input: { models: string[]; trainingType: string };
    }>(stdout);
    expect(data.action).toBe("finetune.train-options");
    expect(data.api).toContain("model-train-options");
    expect(data.input.models).toEqual([DYNAMIC_OPTION_MODEL]);
    expect(data.input.trainingType).toBe("efficient_sft");
  });

  test("finetune train-options 不传 --training-type 时默认 sft", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "train-options",
      "--base-model",
      DYNAMIC_OPTION_MODEL,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ input: { trainingType: string } }>(stdout);
    expect(data.input.trainingType).toBe("sft");
  });

  test("finetune train-options 非法训练类型退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "train-options",
      "--base-model",
      "qwen3-8b",
      "--training-type",
      "nope",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--training-type|nope/);
  });

  test("finetune train-options 缺少 --base-model 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand(["finetune", "train-options", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--base-model|Missing required argument/i);
  });

  test("finetune metrics --dry-run 默认 page_no=1 且显式 page_size=100", async () => {
    // The OpenAPI default is 1000 per page; the CLI keeps the legacy 100-page
    // shape by sending page_size explicitly unless the user overrides it.
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "metrics",
      "--job-id",
      "ft-xxx",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      job_id: string;
      page_no: number;
      page_size: number;
    }>(stdout);
    expect(data.action).toBe("finetune.metrics");
    expect(data.job_id).toBe("ft-xxx");
    expect(data.page_no).toBe(1);
    expect(data.page_size).toBe(100);
  });

  test("finetune metrics --dry-run 转发 page/page-size/workspace 覆盖值", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "metrics",
      "--job-id",
      "ft-xxx",
      "--page",
      "3",
      "--page-size",
      "50",
      "--workspace-id",
      "ws-123",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      page_no: number;
      page_size: number;
      workspace_id?: string;
    }>(stdout);
    expect(data.page_no).toBe(3);
    expect(data.page_size).toBe(50);
    expect(data.workspace_id).toBe("ws-123");
  });

  test("finetune metrics 缺少 --job-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand(["finetune", "metrics", "--quiet"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--job-id|Missing required argument/i);
  });

  test("finetune create --dry-run 解析多 datasets 中的空白", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "text",
      "create",
      "--base-model",
      "qwen3-8b",
      "--datasets",
      " file-a , ,file-b ",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: { training_file_ids: string[] };
    }>(stdout);
    expect(data.body.training_file_ids).toEqual(["file-a", "file-b"]);
  });

  test("finetune audio create --dry-run 用 sft-lora 默认 + audio 超参", async () => {
    // Audio has no --training-type flag; the command fixes modality=audio and
    // defaults to sft-lora (efficient_sft) with the fixed CosyVoice hyper-params.
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "audio",
      "create",
      "--base-model",
      "cosyvoice-v3-flash",
      "--datasets",
      "file-audio",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { training_type: string; hyper_parameters: Record<string, unknown> };
    }>(stdout);
    expect(data.action).toBe("finetune.create");
    expect(data.body.training_type).toBe("efficient_sft");
    // Audio TTS defaults are fixed (not the text n_epochs/batch_size surface).
    expect(data.body.hyper_parameters.lm_max_epoch).toBeDefined();
  });

  test("finetune audio create --help 不暴露文本超参 flag", async () => {
    // Audio models don't consume --training-type / --n-epochs / --batch-size /
    // --learning-rate / --max-length, so those flags are not offered.
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "audio",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-model|--datasets/i);
    expect(stderr).not.toMatch(/--training-type|--n-epochs|--batch-size|--max-length/);
  });

  test("finetune image create --dry-run 用 sft-lora 默认", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "image",
      "create",
      "--base-model",
      "wan2.7-image-pro",
      "--datasets",
      "file-image",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; body: { training_type: string } }>(stdout);
    expect(data.action).toBe("finetune.create");
    expect(data.body.training_type).toBe("efficient_sft");
  });

  test("finetune video create --help 暴露视频超参且不含文本超参", async () => {
    // Video exposes --n-epochs / --batch-size / --learning-rate; the text-only
    // --training-type / --max-length surface is not offered.
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "video",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-model/);
    expect(stderr).toMatch(/--n-epochs/);
    expect(stderr).toMatch(/--batch-size/);
    expect(stderr).toMatch(/--learning-rate/);
    expect(stderr).not.toMatch(/--training-type|--max-length/);
  });

  test("finetune video create --datasets 缺失时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "video",
      "create",
      "--base-model",
      "wan2.7-i2v",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--datasets|Missing required/i);
  });

  test.each([
    // Model-family-specific defaults resolved by the sft-lora video profile.
    ["wan2.7-i2v", 1, 102400],
    ["wan2.5-i2v-preview", 4, 36864],
    ["wan2.2-kf2v-flash", 4, 262144],
  ])(
    "finetune video create --dry-run %s 解析 batch_size=%i / max_pixels=%i",
    async (baseModel, batchSize, maxPixels) => {
      const { stdout, stderr, exitCode } = await runSchemaCommand([
        "finetune",
        "video",
        "create",
        "--base-model",
        baseModel,
        "--datasets",
        "file-video",
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{
        action: string;
        body: {
          model: string;
          training_type: string;
          hyper_parameters: Record<string, unknown>;
        };
      }>(stdout);
      expect(data.action).toBe("finetune.create");
      expect(data.body.model).toBe(baseModel);
      expect(data.body.training_type).toBe("efficient_sft");
      expect(data.body.hyper_parameters.batch_size).toBe(batchSize);
      expect(data.body.hyper_parameters.max_pixels).toBe(maxPixels);
      expect(data.body.hyper_parameters.learning_rate).toBe("2e-5");
      expect(data.body.hyper_parameters.lora_rank).toBe(32);
    },
  );

  test("finetune video create --dry-run 转发超参覆盖且不做 clamp", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "video",
      "create",
      "--base-model",
      "wan2.7-i2v",
      "--datasets",
      "file-video",
      "--n-epochs",
      "100",
      "--batch-size",
      "2",
      "--learning-rate",
      "1e-5",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: { hyper_parameters: Record<string, unknown> };
    }>(stdout);
    // Video overrides are forwarded verbatim (no [8, 1024] text clamp).
    expect(data.body.hyper_parameters.n_epochs).toBe(100);
    expect(data.body.hyper_parameters.batch_size).toBe(2);
    expect(data.body.hyper_parameters.learning_rate).toBe("1e-5");
  });
});

describe("e2e: finetune decision create (offline)", () => {
  const decisionModel = "decision-model-preview-2026-09-24";
  let fixtureDir = "";
  let train3 = "";
  let train10 = "";
  let val10 = "";
  let val10Drift = "";
  let badLabel = "";
  let fakeZip = "";

  function decisionRecord(overrides?: { instructions?: string; label?: string }): string {
    return JSON.stringify({
      state: "Customer complains the invoice title is wrong.",
      questions: {
        team: {
          type: "choice",
          instructions: overrides?.instructions ?? "Which team should handle this?",
          criteria: { billing: "Payment and billing issues", technical: "Product fault issues" },
          label: overrides?.label ?? "billing",
        },
      },
    });
  }

  function decisionLines(count: number, overrides?: { instructions?: string }): string[] {
    return Array.from({ length: count }, () => decisionRecord(overrides));
  }

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "bl-finetune-decision-e2e-"));
    train3 = join(fixtureDir, "train-3.jsonl");
    train10 = join(fixtureDir, "train-10.jsonl");
    val10 = join(fixtureDir, "val-10.jsonl");
    val10Drift = join(fixtureDir, "val-10-drift.jsonl");
    badLabel = join(fixtureDir, "bad-label.jsonl");
    fakeZip = join(fixtureDir, "data.zip");
    writeFileSync(train3, decisionLines(3).join("\n"));
    writeFileSync(train10, decisionLines(10).join("\n"));
    writeFileSync(val10, decisionLines(10).join("\n"));
    writeFileSync(
      val10Drift,
      decisionLines(10, { instructions: "A different wording?" }).join("\n"),
    );
    writeFileSync(badLabel, decisionRecord({ label: "sales" }));
    writeFileSync(fakeZip, "not-a-real-zip");
  });

  afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

  test("decision create --help 展示三个超参且不暴露文本专属 flag", async () => {
    const { stderr, exitCode } = await runCommandHelp(FINETUNE_ROUTES, [
      "finetune",
      "decision",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--base-model/);
    expect(stderr).toMatch(/--datasets/);
    expect(stderr).toMatch(/--n-epochs/);
    expect(stderr).toMatch(/--batch-size/);
    expect(stderr).toMatch(/--learning-rate/);
    expect(stderr).not.toMatch(/--training-type|--max-length|--lora-rank|--split/);
  });

  test("decision create 缺少 --datasets 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--datasets|Missing required/i);
  });

  test("decision create 缺少 --base-model 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--datasets",
      "file-aaa",
      "--quiet",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--base-model|Missing required/i);
  });

  test("decision create --suffix 超过 8 字符时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      "file-aaa",
      "--suffix",
      "waytoolong",
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/suffix/i);
  });

  test("decision create --dry-run 构造 efficient_sft 默认请求体", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      "file-aaa,file-bbb",
      "--validations",
      "file-ccc",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        model: string;
        training_file_ids: string[];
        validation_file_ids: string[];
        training_type: string;
        hyper_parameters: Record<string, unknown>;
      };
    }>(stdout);
    expect(data.action).toBe("finetune.create");
    expect(data.body.model).toBe(decisionModel);
    expect(data.body.training_file_ids).toEqual(["file-aaa", "file-bbb"]);
    expect(data.body.validation_file_ids).toEqual(["file-ccc"]);
    expect(data.body.training_type).toBe("efficient_sft");
    // The API requires hyper_parameters in the body; omitted knobs are sent
    // with the documented defaults.
    expect(data.body.hyper_parameters).toEqual({
      n_epochs: 2,
      batch_size: 1,
      learning_rate: "2e-5",
    });
  });

  test("decision create --dry-run 仅透传三个超参与命名 flag", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      "file-aaa",
      "--n-epochs",
      "3",
      "--batch-size",
      "4",
      "--learning-rate",
      "2e-5",
      "--job-name",
      "decision-job",
      "--model-name",
      "decision-model",
      "--suffix",
      "mytune",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: {
        job_name: string;
        model_name: string;
        finetuned_output_suffix: string;
        hyper_parameters: Record<string, unknown>;
      };
    }>(stdout);
    expect(data.body.job_name).toBe("decision-job");
    expect(data.body.model_name).toBe("decision-model");
    expect(data.body.finetuned_output_suffix).toBe("mytune");
    expect(data.body.hyper_parameters).toEqual({
      n_epochs: 3,
      batch_size: 4,
      learning_rate: "2e-5",
    });
  });

  test("decision create --dry-run 本地路径标记 pending 且不校验不上传", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train3,
      "--validations",
      val10,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      body: { training_file_ids: string[]; validation_file_ids: string[] };
      pending_uploads: { field: string; path: string }[];
    }>(stdout);
    expect(data.body.training_file_ids).toEqual([train3]);
    expect(data.body.validation_file_ids).toEqual([val10]);
    expect(data.pending_uploads.map((pending) => pending.field).sort()).toEqual([
      "datasets",
      "validations",
    ]);
  });

  test.each([
    ["--batch-size", "2000"],
    ["--n-epochs", "0"],
  ])("decision create 按平台参数 schema 拒绝非法 %s=%s", async (flagName, invalidValue) => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      "file-aaa",
      flagName,
      invalidValue,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/batch_size|n_epochs/);
  });

  test("decision create 本地数据校验失败时不上传", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      badLabel,
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toMatch(/DECISION_INVALID_CHOICE_LABEL/);
    expect(combined).not.toMatch(/Uploaded .* → file-/);
  });

  test("decision create 拒绝非 .jsonl 数据文件", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      fakeZip,
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/DECISION_UNSUPPORTED_FORMAT/);
  });

  test("decision create 仅训练集时样本数 < batch_size×10 提交前失败", async () => {
    // Default batch_size=1 → training-only minimum is 10; 3 records fail.
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train3,
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toMatch(/requires at least 10/);
    expect(combined).toMatch(/INSUFFICIENT_DECISION_SAMPLES|样本数检查未通过/);
    expect(combined).not.toMatch(/Uploaded .* → file-/);
  });

  test("decision create 显式 --batch-size 放大训练集门槛", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train3,
      "--batch-size",
      "4",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toMatch(/requires at least 40/);
  });

  test("decision create 有验证集时训练集门槛降为 batch_size 且验证集同检", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train3,
      "--validations",
      val10,
      "--batch-size",
      "4",
      "--output",
      "json",
    ]);
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toMatch(/training dataset has 3 sample\(s\), requires at least 4/);
    expect(combined).not.toMatch(/validation dataset has/);
    expect(combined).not.toMatch(/Uploaded .* → file-/);
  });

  test("decision create 样本数达标时通过 gate（后续上传命中 mock 404）", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train10,
      "--output",
      "json",
    ]);
    // The gate passes at the ≥10 boundary; the upload then hits the loopback
    // 404 (no real network), proving the failure is no longer the sample gate.
    expect(exitCode, stdout + stderr).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).not.toMatch(/sample-count check failed|样本数检查未通过/);
    expect(combined).toMatch(/unexpected path/);
  });

  test("decision create 训练/验证问题定义漂移发出 warning 后继续", async () => {
    const { stdout, stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train10,
      "--validations",
      val10Drift,
      "--output",
      "json",
    ]);
    // Warning only (not blocking): the flow proceeds to the upload, which
    // fails on the loopback 404.
    expect(exitCode, stdout + stderr).not.toBe(0);
    expect(stderr).toMatch(/DECISION_QUESTION_DEFINITION_MISMATCH/);
    expect(stderr).toMatch(/team/);
    expect(stderr).toMatch(/unexpected path/);
  });

  test("decision create 训练/验证定义一致时不发漂移 warning", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "decision",
      "create",
      "--base-model",
      decisionModel,
      "--datasets",
      train10,
      "--validations",
      val10,
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).not.toMatch(/DECISION_QUESTION_DEFINITION_MISMATCH/);
    expect(stderr).toMatch(/unexpected path/);
  });
});

describe("e2e: finetune high-risk confirmation", () => {
  test("finetune delete --help 展示 runtime 注入的 --yes", async () => {
    const { stderr, exitCode } = await runSchemaCommand(["finetune", "delete", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
  });

  test("finetune delete 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runSchemaCommand([
      "finetune",
      "delete",
      "--job-id",
      "ft-xxx",
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: finetune (DashScope)", () => {
  /**
   * 不同开发者的 key 状态不一：可能鉴权失败、可能账号下没有任何微调记录、
   * 也可能受区域/权限限制。因此本用例不假设"有数据"或"调用成功"：
   *   - 成功（exit 0）：响应必须可解析；jobs 可能为空数组或不存在。
   *   - 失败（非零退出）：只要 CLI 把服务端/鉴权错误优雅上抛（stderr 有内容、
   *     而非进程崩溃），即视为通过。
   */
  test("finetune list --output json 优雅返回（空账号或鉴权失败均通过）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(FINETUNE_ROUTES, [
      "finetune",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    if (exitCode === 0) {
      const data = parseStdoutJson<{ data?: { jobs?: unknown[] } }>(stdout);
      expect(data).toBeTruthy();
      if (data.data?.jobs) {
        expect(Array.isArray(data.data.jobs)).toBe(true);
      }
    } else {
      expect(stderr.length).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe("finetune complete recipe (offline)", () => {
  const recipeArgs = [
    "finetune",
    "text",
    "create",
    "--base-model",
    "qwen3-4b-instruct-2507",
    "--datasets",
    "file-jev",
    "--job-name",
    "jev-train",
    "--model-name",
    "jev-model",
    "--priority",
    "L0",
    "--n-epochs",
    "1",
    "--batch-size",
    "8",
    "--learning-rate",
    "5e-5",
    "--max-length",
    "32768",
    "--eval-steps",
    "50",
    "--lora-alpha",
    "16",
    "--lora-dropout",
    "0.1",
    "--lora-rank",
    "8",
    "--lr-scheduler-type",
    "linear",
    "--save-strategy",
    "epoch",
    "--save-total-limit",
    "3",
    "--split",
    "0.9",
    "--max-split-val-dataset-sample",
    "1000",
    "--data-augmentation",
    "false",
    "--dry-run",
    "--output",
    "json",
  ];
  test("preserves names, priority and every explicit hyperparameter", async () => {
    const result = await runSchemaCommand(recipeArgs);
    expect(result.exitCode, result.stderr).toBe(0);
    const response = parseStdoutJson<{ body: Record<string, unknown> }>(result.stdout);
    expect(response.body).toMatchObject({
      job_name: "jev-train",
      model_name: "jev-model",
      priority: "L0",
    });
    expect(response.body.hyper_parameters).toEqual({
      n_epochs: 1,
      batch_size: 8,
      learning_rate: "5e-5",
      max_length: 32768,
      eval_steps: 50,
      lora_alpha: 16,
      lora_dropout: 0.1,
      lora_rank: 8,
      lr_scheduler_type: "linear",
      save_strategy: "epoch",
      save_total_limit: 3,
      split: 0.9,
      max_split_val_dataset_sample: 1000,
      data_augmentation: false,
    });
  });
  test.each([
    ["--lora-rank", "0"],
    ["--lora-dropout", "1"],
    ["--split", "1"],
    ["--priority", "L9"],
  ])("rejects invalid %s before submission", async (flagName, invalidValue) => {
    const invalidArgs = [...recipeArgs];
    invalidArgs[invalidArgs.indexOf(flagName) + 1] = invalidValue;
    const result = await runSchemaCommand(invalidArgs);
    expect(result.exitCode).toBe(2);
  });
});
