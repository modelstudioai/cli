import {
  defineCommand,
  detectOutputFormat,
  updateDeployment,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const UPDATE_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: "Deployed model identifier (required)",
    required: true,
  },
  rpmLimit: {
    type: "number",
    valueHint: "<n>",
    description: "Requests per minute",
  },
  tpmLimit: {
    type: "number",
    valueHint: "<n>",
    description: "Tokens per minute",
  },
  yes: { type: "switch", description: "Confirm the rate-limit update (required to update)" },
} satisfies FlagsDef;

/**
 * `bl deploy update` — update deployment rate limits.
 *
 * PUT /api/v1/deployments/{deployed_model}
 * Body: at least one of `rpm_limit` (requests/min) or `tpm_limit` (tokens/min).
 */
export default defineCommand({
  description: "Update a deployment's rate limits (rpm_limit / tpm_limit)",
  auth: "apiKey",
  usageArgs: "--deployed-model <id> --yes [--rpm-limit <n>] [--tpm-limit <n>]",
  flags: UPDATE_FLAGS,
  exampleArgs: [
    "--deployed-model dep-... --rpm-limit 1000 --yes",
    "--deployed-model dep-... --rpm-limit 1000 --tpm-limit 200000 --yes",
  ],
  notes: ["At least one of --rpm-limit / --tpm-limit must be provided."],
  validate: (flags) =>
    flags.rpmLimit === undefined && flags.tpmLimit === undefined
      ? "Provide at least one of --rpm-limit / --tpm-limit."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;
    const format = detectOutputFormat(settings.output);

    const body: Record<string, unknown> = {};
    if (flags.rpmLimit !== undefined) body.rpm_limit = flags.rpmLimit;
    if (flags.tpmLimit !== undefined) body.tpm_limit = flags.tpmLimit;

    if (settings.dryRun) {
      emitResult({ action: "deploy.update", deployed_model: deployedModel, body }, format);
      return;
    }

    if (!flags.yes) {
      const parts: string[] = [];
      if (flags.rpmLimit !== undefined) parts.push(`rpm_limit=${flags.rpmLimit}`);
      if (flags.tpmLimit !== undefined) parts.push(`tpm_limit=${flags.tpmLimit}`);
      throw new BailianError(
        `Refusing to update rate limits for ${deployedModel} (${parts.join(", ")}) without --yes.`,
        ExitCode.USAGE,
        "Pass --yes to confirm the rate-limit update.",
      );
    }

    const response = await updateDeployment(ctx.client, deployedModel, body);
    const deployment = response.output ?? response.data;

    if (settings.quiet) {
      emitBare(deployedModel);
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
