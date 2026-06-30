import {
  defineCommand,
  detectOutputFormat,
  updateDeployment,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

/**
 * `bl deploy update` — update deployment rate limits.
 *
 * PUT /api/v1/deployments/{deployed_model}
 * Body: at least one of `rpm_limit` (requests/min) or `tpm_limit` (tokens/min).
 */
export default defineCommand({
  name: "deploy update",
  description: "Update a deployment's rate limits (rpm_limit / tpm_limit)",
  usage: "bl deploy update --deployed-model <id> [--rpm-limit <n>] [--tpm-limit <n>] [--yes]",
  options: [
    {
      flag: "--deployed-model <id>",
      description: "Deployed model identifier (required)",
      required: true,
    },
    {
      flag: "--rpm-limit <n>",
      description: "Requests per minute",
      type: "number",
    },
    {
      flag: "--tpm-limit <n>",
      description: "Tokens per minute",
      type: "number",
    },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
  ],
  examples: [
    "bl deploy update --deployed-model dep-... --rpm-limit 1000",
    "bl deploy update --deployed-model dep-... --rpm-limit 1000 --tpm-limit 200000 --yes",
  ],
  notes: ["At least one of --rpm-limit / --tpm-limit must be provided."],
  async run(config: Config, flags: GlobalFlags) {
    const deployedModel = flags.deployedModel as string | undefined;
    if (!deployedModel)
      failIfMissing(
        "deployed-model",
        "bl deploy update --deployed-model <id> [--rpm-limit <n>] [--tpm-limit <n>]",
      );

    const rpmLimit = flags.rpmLimit !== undefined ? (flags.rpmLimit as number) : undefined;
    const tpmLimit = flags.tpmLimit !== undefined ? (flags.tpmLimit as number) : undefined;

    if (rpmLimit === undefined && tpmLimit === undefined) {
      throw new BailianError("Provide at least one of --rpm-limit / --tpm-limit.", ExitCode.USAGE);
    }

    const format = detectOutputFormat(config.output);
    const body: Record<string, unknown> = {};
    if (rpmLimit !== undefined) body.rpm_limit = rpmLimit;
    if (tpmLimit !== undefined) body.tpm_limit = tpmLimit;

    if (config.dryRun) {
      emitResult({ action: "deploy.update", deployed_model: deployedModel, body }, format);
      return;
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      const parts: string[] = [];
      if (rpmLimit !== undefined) parts.push(`rpm_limit=${rpmLimit}`);
      if (tpmLimit !== undefined) parts.push(`tpm_limit=${tpmLimit}`);
      process.stderr.write(`Update rate limits for ${deployedModel} (${parts.join(", ")})?\n`);
      const ok = await promptConfirm({ message: "Proceed?", initialValue: false });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm rate-limit update in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await updateDeployment(config, deployedModel!, body);
    const deployment = response.output ?? response.data;

    if (config.quiet) {
      emitBare(deployedModel!);
    } else if (format === "text") {
      const parts: string[] = [];
      if (deployment?.rpm_limit !== undefined) parts.push(`rpm_limit=${deployment.rpm_limit}`);
      if (deployment?.tpm_limit !== undefined) parts.push(`tpm_limit=${deployment.tpm_limit}`);
      const summary = parts.length ? ` (${parts.join(", ")})` : "";
      emitBare(`Updated ${deployedModel}${summary}.`);
    } else {
      emitResult(response, format);
    }
  },
});
