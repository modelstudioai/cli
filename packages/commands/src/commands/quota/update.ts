import { defineCommand, detectOutputFormat, modelsLimitsPath } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { formatNumber } from "../shared/format.ts";

const MINUTE_SECONDS = 60;

export default defineCommand({
  description: {
    "en-US": "Update model rate limits (QPM/TPM)",
    "zh-CN": "更新模型限流配置（QPM/TPM）",
  },
  auth: "apiKey",
  usageArgs: "--model <model> [--rpm <n>] [--tpm <n>]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: { "en-US": "Model name (required)", "zh-CN": "模型名称（必填）" },
      required: true,
    },
    rpm: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Max requests per minute (QPM)",
        "zh-CN": "每分钟最大请求数（QPM）",
      },
    },
    tpm: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Max tokens per minute (TPM)",
        "zh-CN": "每分钟最大 Token 数（TPM）",
      },
    },
  },
  exampleArgs: [
    "--model qwen-plus --rpm 60 --tpm 100000",
    "--model qwen3-max --tpm 500000",
    "--model qwen-plus --rpm 60 --output json",
  ],
  notes: [
    {
      "en-US":
        'Fields you omit keep their current values (server-side OVERLAY merge). Clear all custom limits with the "quota delete" command instead.',
      "zh-CN":
        "未指定的字段将保留当前值（服务端 OVERLAY 合并）。清除全部自定义限流配置请改用 “quota delete” 命令。",
    },
    {
      "en-US":
        "Setting TPM without an existing QPM limit is rejected server-side — pass --rpm first or together.",
      "zh-CN": "若当前没有 QPM 限制，单独设置 TPM 会被服务端拒绝——请先设置 --rpm，或同时传入。",
    },
  ],
  validate: (flags) => {
    if (flags.rpm === undefined && flags.tpm === undefined)
      return "one of --rpm / --tpm is required.";
    if (flags.rpm !== undefined && flags.rpm < 0) return "--rpm must be a non-negative number.";
    if (flags.tpm !== undefined && flags.tpm < 0) return "--tpm must be a non-negative number.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelName = flags.model;
    const format = detectOutputFormat(settings.output);

    const entry: Record<string, unknown> = { model: modelName };
    if (flags.rpm !== undefined) {
      entry.request_limit = flags.rpm;
      entry.request_limit_period = MINUTE_SECONDS;
    }
    if (flags.tpm !== undefined) {
      entry.usage_limit = flags.tpm;
      entry.usage_limit_period = MINUTE_SECONDS;
    }
    const body = { models: [entry] };

    if (settings.dryRun) {
      emitResult(
        { endpoint: ctx.client.url(modelsLimitsPath()), method: "POST", request: body },
        format,
      );
      return;
    }

    const result = await ctx.client.requestJson<{ request_id?: string }>({
      path: modelsLimitsPath(),
      method: "POST",
      body,
    });

    if (format === "json") {
      emitResult({ model: modelName, ...result }, format);
      return;
    }
    const parts: string[] = [];
    if (flags.rpm !== undefined) parts.push(`QPM ${formatNumber(flags.rpm)}`);
    if (flags.tpm !== undefined) parts.push(`TPM ${formatNumber(flags.tpm)}`);
    process.stdout.write(`Rate limits updated for "${modelName}": ${parts.join(", ")}\n`);
  },
});
