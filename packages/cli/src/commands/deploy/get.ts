import {
  defineCommand,
  detectOutputFormat,
  getDeployment,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "deploy get",
  description: "Get details of a single model deployment",
  usage: "bl deploy get --deployed-model <id>",
  options: [
    {
      flag: "--deployed-model <id>",
      description: "Deployed model identifier (required)",
      required: true,
    },
  ],
  examples: [
    "bl deploy get --deployed-model qwen-plus-2025-12-01-b6d61c71",
    "bl deploy get --deployed-model qwen-plus-2025-12-01-b6d61c71 --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const deployedModel = flags.deployedModel as string | undefined;
    if (!deployedModel) failIfMissing("deployed-model", "bl deploy get --deployed-model <id>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "deploy.get", deployed_model: deployedModel }, format);
      return;
    }

    const response = await getDeployment(config, deployedModel!);
    const d = response.output ?? response.data;

    if (!d) {
      emitBare(`No data returned for ${deployedModel}`);
      return;
    }

    const item: Record<string, unknown> = {
      deployed_model: d.deployed_model ?? deployedModel,
      deployed_name: d.name ?? "",
      model_name: d.model_name ?? "",
      base_model: d.base_model ?? "",
      status: d.status ?? "",
      plan: d.plan ?? "",
    };
    if (d.model_unit_spec) item.model_unit_spec = d.model_unit_spec;
    if (d.charge_type) item.charge_type = d.charge_type;
    if (d.capacity !== undefined) item.capacity = d.capacity;
    if (d.base_capacity !== undefined) item.base_capacity = d.base_capacity;
    if (d.ready_capacity !== undefined) item.ready_capacity = d.ready_capacity;
    if (d.rpm_limit !== undefined) item.rpm_limit = d.rpm_limit;
    if (d.tpm_limit !== undefined) item.tpm_limit = d.tpm_limit;
    if (d.input_tpm !== undefined) item.input_tpm = d.input_tpm;
    if (d.output_tpm !== undefined) item.output_tpm = d.output_tpm;
    if (d.gmt_create) item.created_at = d.gmt_create;
    if (d.gmt_modified) item.updated_at = d.gmt_modified;

    if (format === "json") {
      emitResult(item, format);
      return;
    }

    // text / quiet — fixed-width label column for alignment
    const label = (k: string) => `${k}:`.padEnd(18);
    for (const [k, v] of Object.entries(item)) {
      if (v === "" || v === undefined) continue;
      emitBare(`${label(k)}${v}`);
    }
  },
});
