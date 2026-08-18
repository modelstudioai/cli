import { defineCommand, updateDeployment, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const UPDATE_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deployed model identifier (required)",
      "zh-CN": "已部署模型标识（必填）",
    },
    required: true,
  },
  rpmLimit: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Requests per minute", "zh-CN": "每分钟请求数" },
  },
  tpmLimit: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Tokens per minute", "zh-CN": "每分钟 Token 数" },
  },
} satisfies FlagsDef;

/**
 * `bl deploy update` — update deployment rate limits.
 *
 * PUT /api/v1/deployments/{deployed_model}
 * Body: at least one of `rpm_limit` (requests/min) or `tpm_limit` (tokens/min).
 */
export default defineCommand({
  description: {
    "en-US": "Update a deployment's rate limits (rpm_limit / tpm_limit)",
    "zh-CN": "更新部署的限流配置（rpm_limit / tpm_limit）",
  },
  auth: "apiKey",
  usageArgs: "--deployed-model <id> [--rpm-limit <n>] [--tpm-limit <n>]",
  flags: UPDATE_FLAGS,
  exampleArgs: [
    "--deployed-model dep-... --rpm-limit 1000",
    "--deployed-model dep-... --rpm-limit 1000 --tpm-limit 200000",
  ],
  notes: [
    {
      "en-US": "At least one of --rpm-limit / --tpm-limit must be provided.",
      "zh-CN": "--rpm-limit / --tpm-limit 至少需要提供一个。",
    },
  ],
  validate: (flags) =>
    flags.rpmLimit === undefined && flags.tpmLimit === undefined
      ? "Provide at least one of --rpm-limit / --tpm-limit."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;

    const body: Record<string, unknown> = {};
    if (flags.rpmLimit !== undefined) body.rpm_limit = flags.rpmLimit;
    if (flags.tpmLimit !== undefined) body.tpm_limit = flags.tpmLimit;

    if (settings.dryRun) {
      emitResult({ action: "deploy.update", deployed_model: deployedModel, body }, "json");
      return;
    }

    const response = await updateDeployment(ctx.client, deployedModel, body);

    if (settings.quiet) {
      emitBare(deployedModel);
    } else {
      emitResult(response, "json");
    }
  },
});
