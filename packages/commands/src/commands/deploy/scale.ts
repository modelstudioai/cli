import {
  defineCommand,
  detectOutputFormat,
  scaleDeployment,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

const SCALE_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deployed model identifier (required)",
      "zh-CN": "已部署模型标识（必填）",
    },
    required: true,
  },
  capacity: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "New capacity in plan units (must be a multiple of base_capacity)",
      "zh-CN": "以方案单元表示的新容量（必须是 base_capacity 的整数倍）",
    },
  },
  inputTpm: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "PTU only — input tokens per minute",
      "zh-CN": "仅 PTU：每分钟输入 Token 数",
    },
  },
  outputTpm: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "PTU only — output tokens per minute",
      "zh-CN": "仅 PTU：每分钟输出 Token 数",
    },
  },
} satisfies FlagsDef;

/**
 * `bl deploy scale` — adjust capacity (and optional PTU input/output token rates).
 *
 * Server-side capacity constraint: positive integer, < 1000, must be an
 * integer multiple of `base_capacity` (visible via `bl deploy get`).
 */
export default defineCommand({
  description: { "en-US": "Scale a deployment's capacity", "zh-CN": "调整部署容量" },
  auth: "apiKey",
  usageArgs: "--deployed-model <id> --capacity <n> [--input-tpm <n>] [--output-tpm <n>]",
  flags: SCALE_FLAGS,
  exampleArgs: [
    "--deployed-model qwen-plus-...-b6d61c71 --capacity 8",
    "--deployed-model dep-... --capacity 2",
  ],
  validate: (flags) =>
    flags.capacity === undefined && flags.inputTpm === undefined && flags.outputTpm === undefined
      ? "Provide at least one of --capacity / --input-tpm / --output-tpm."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;
    const format = detectOutputFormat(settings.output);

    const body: Record<string, unknown> = {};
    if (flags.capacity !== undefined) body.capacity = flags.capacity;
    if (flags.inputTpm !== undefined) body.input_tpm = flags.inputTpm;
    if (flags.outputTpm !== undefined) body.output_tpm = flags.outputTpm;

    if (settings.dryRun) {
      emitResult({ action: "deploy.scale", deployed_model: deployedModel, body }, format);
      return;
    }

    const response = await scaleDeployment(ctx.client, deployedModel, body);
    const deployment = response.output ?? response.data;

    if (settings.quiet) {
      emitBare(deployedModel);
    } else if (format === "text") {
      const cap = deployment?.capacity !== undefined ? ` (capacity=${deployment.capacity})` : "";
      emitBare(`Scaled ${deployedModel}${cap}.`);
      emitRequestId(response.request_id, settings.quiet);
    } else {
      emitResult(response, format);
    }
  },
});
