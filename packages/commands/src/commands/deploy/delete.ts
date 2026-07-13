import {
  defineCommand,
  detectOutputFormat,
  deleteDeployment,
  getDeployment,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: "Deployed model identifier (required)",
    required: true,
  },
  skipPrecheck: {
    type: "switch",
    description: "Skip the local STOPPED/FAILED status precheck",
  },
} satisfies FlagsDef;

/**
 * `bl deploy delete` — destroy a deployment.
 *
 * Server-side precondition: status must be STOPPED or FAILED. We surface a
 * clear local hint for RUNNING / PENDING deployments before issuing the
 * DELETE call.
 */
export default defineCommand({
  description: "Delete a model deployment (must be STOPPED or FAILED)",
  auth: "apiKey",
  usageArgs: "--deployed-model <id> [--skip-precheck]",
  flags: DELETE_FLAGS,
  exampleArgs: ["--deployed-model dep-...", "--deployed-model dep-... --dry-run"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "deploy.delete", deployed_model: deployedModel }, format);
      return;
    }

    // Precheck status unless skipped — surface a clear hint instead of letting
    // the server return a generic precondition error.
    if (!flags.skipPrecheck) {
      try {
        const get = await getDeployment(ctx.client, deployedModel);
        const deployment = get.output ?? get.data;
        const status = (deployment?.status ?? "").toUpperCase();
        if (status && status !== "STOPPED" && status !== "FAILED") {
          throw new BailianError(
            `Deployment ${deployedModel} is ${status}. Only STOPPED / FAILED deployments can be deleted. ` +
              `Stop it first via the platform console, or pass --skip-precheck to attempt deletion anyway.`,
            ExitCode.USAGE,
          );
        }
      } catch (error) {
        if (error instanceof BailianError) throw error;
        // If the get itself failed (e.g. not found), let the DELETE call surface the real error.
      }
    }

    const response = await deleteDeployment(ctx.client, deployedModel);

    if (settings.quiet) {
      emitBare(deployedModel);
    } else if (format === "text") {
      emitBare(`Deleted ${deployedModel}.`);
    } else {
      emitResult(response, format);
    }
  },
});
