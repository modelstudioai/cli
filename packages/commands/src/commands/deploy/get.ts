import { defineCommand, getDeployment, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const GET_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Deployed model identifier (required)",
      "zh-CN": "已部署模型标识（必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Get details of a single model deployment",
    "zh-CN": "获取单个模型部署的详情",
  },
  auth: "apiKey",
  usageArgs: "--deployed-model <id>",
  flags: GET_FLAGS,
  exampleArgs: [
    "--deployed-model qwen-plus-2025-12-01-b6d61c71",
    "--deployed-model qwen-plus-2025-12-01-b6d61c71 --output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;

    if (settings.dryRun) {
      emitResult({ action: "deploy.get", deployed_model: deployedModel }, "json");
      return;
    }

    const response = await getDeployment(ctx.client, deployedModel);
    const deployment = response.output ?? response.data;

    if (!deployment) {
      emitResult({ deployed_model: deployedModel, request_id: response.request_id }, "json");
      return;
    }

    const item: Record<string, unknown> = {
      deployed_model: deployment.deployed_model ?? deployedModel,
      deployed_name: deployment.name ?? "",
      model_name: deployment.model_name ?? "",
      base_model: deployment.base_model ?? "",
      status: deployment.status ?? "",
      plan: deployment.plan ?? "",
    };
    if (deployment.model_unit_spec) item.model_unit_spec = deployment.model_unit_spec;
    if (deployment.charge_type) item.charge_type = deployment.charge_type;
    if (deployment.capacity !== undefined) item.capacity = deployment.capacity;
    if (deployment.base_capacity !== undefined) item.base_capacity = deployment.base_capacity;
    if (deployment.ready_capacity !== undefined) item.ready_capacity = deployment.ready_capacity;
    if (deployment.rpm_limit !== undefined) item.rpm_limit = deployment.rpm_limit;
    if (deployment.tpm_limit !== undefined) item.tpm_limit = deployment.tpm_limit;
    if (deployment.input_tpm !== undefined) item.input_tpm = deployment.input_tpm;
    if (deployment.output_tpm !== undefined) item.output_tpm = deployment.output_tpm;
    if (deployment.gmt_create) item.created_at = deployment.gmt_create;
    if (deployment.gmt_modified) item.updated_at = deployment.gmt_modified;

    emitResult({ ...item, request_id: response.request_id }, "json");
  },
});
