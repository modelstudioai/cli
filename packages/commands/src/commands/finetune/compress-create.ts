import {
  defineCommand,
  createCompressJob,
  type CreateCompressJobRequest,
  type FlagsDef,
} from "bailian-cli-core";

import { parseCommaSeparated, parseCompressHyperParameters } from "./compress-shared.ts";

const CREATE_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Source custom model ID (required)",
      "zh-CN": "源自定义模型 ID（必填）",
    },
    required: true,
  },
  templateId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Compression template ID (required)", "zh-CN": "压缩模板 ID（必填）" },
    required: true,
  },
  jobName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Unique job name (max 50 characters)",
      "zh-CN": "唯一任务名称（最多 50 字符）",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Job description (max 200 characters)",
      "zh-CN": "任务描述（最多 200 字符）",
    },
  },
  hparam: {
    type: "array",
    valueHint: "<key=value>",
    description: {
      "en-US": "Hyper-parameter override; repeat for multiple values",
      "zh-CN": "超参数覆盖；可重复传入多个值",
    },
  },
  calibrationFiles: {
    type: "string",
    valueHint: "<file-id,...>",
    description: {
      "en-US": "Comma-separated calibration dataset file IDs",
      "zh-CN": "逗号分隔的校准数据集文件 ID",
    },
  },
  suffix: {
    type: "string",
    valueHint: "<suffix>",
    description: {
      "en-US": "Output model suffix (1–8 lowercase letters or digits)",
      "zh-CN": "产出模型后缀（1–8 个小写字母或数字）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Create a model compression job", "zh-CN": "创建模型压缩任务" },
  auth: "apiKey",
  usageArgs: "--model <model> --template-id <id> [flags]",
  flags: CREATE_FLAGS,
  validate(flags) {
    if (flags.jobName !== undefined && flags.jobName.length > 50)
      return "--job-name must be at most 50 characters. / --job-name 最多 50 个字符。";
    if (flags.description !== undefined && flags.description.length > 200)
      return "--description must be at most 200 characters. / --description 最多 200 个字符。";
    if (flags.suffix !== undefined && !/^[a-z0-9]{1,8}$/.test(flags.suffix))
      return "--suffix must contain 1–8 lowercase letters or digits. / --suffix 必须为 1–8 个小写字母或数字。";
    return undefined;
  },
  exampleArgs: [
    "--model qwen3.5-flash-2026-02-23-ft-xxx --template-id quant-flash-nvfp4-mlp-nomtp",
    "--model qwen3.5-flash-2026-02-23-ft-xxx --template-id quant-flash-nvfp4-mlp-nomtp --suffix test --hparam calib_input=true",
  ],
  notes: [
    {
      "en-US": "Run `finetune compress templates` first to get a compatible template ID.",
      "zh-CN": "请先运行 `finetune compress templates` 获取兼容的模板 ID。",
    },
    {
      "en-US": "Model compression APIs are currently available only in the Beijing region.",
      "zh-CN": "模型压缩 API 当前仅在北京 Region 开放。",
    },
  ],
  async run(ctx) {
    const hyperParameters = parseCompressHyperParameters(ctx.flags.hparam);
    const calibrationFileIds = parseCommaSeparated(ctx.flags.calibrationFiles);
    const body: CreateCompressJobRequest = {
      model: ctx.flags.model,
      template_id: ctx.flags.templateId,
      ...(ctx.flags.jobName ? { job_name: ctx.flags.jobName } : {}),
      ...(ctx.flags.description ? { job_description: ctx.flags.description } : {}),
      ...(Object.keys(hyperParameters).length ? { hyper_parameters: hyperParameters } : {}),
      ...(calibrationFileIds ? { custom_calibration_file_ids: calibrationFileIds } : {}),
      ...(ctx.flags.suffix ? { output_model_suffix: ctx.flags.suffix } : {}),
    };
    if (ctx.settings.dryRun) {
      const resultData1 = { action: "finetune.compress.create", request: body };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    const response = await createCompressJob(ctx.client, body);
    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
