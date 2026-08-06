import {
  defineCommand,
  startModelService,
  listIndependentDeployedModels,
  findDeploymentEntry,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const RESUME_FLAGS = {
  deployedModel: {
    type: "string",
    valueHint: "<id>",
    description: "Deployed model identifier (required)",
    required: true,
  },
  skipPrecheck: {
    type: "switch",
    description: "Skip the local STOPPED status precheck",
  },
} satisfies FlagsDef;

/**
 * `bl deploy resume` — resume a paused deployment.
 *
 * Brings the model service back online so it can serve inference requests.
 * Precheck: status must be STOPPED.
 */
export default defineCommand({
  description: "Resume a paused model deployment (brings service back online)",
  auth: "console",
  usageArgs: "--deployed-model <id> [--skip-precheck]",
  flags: RESUME_FLAGS,
  exampleArgs: [
    "--deployed-model dep-...",
    "--deployed-model dep-... --skip-precheck",
    "--deployed-model dep-... --dry-run",
  ],
  notes: [
    "Precheck verifies status is STOPPED before issuing the resume; pass --skip-precheck to bypass.",
    "For mu/ptu plans, billing resumes once the service is back online.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;

    if (settings.dryRun) {
      emitResult({ action: "deploy.resume", deployed_model: deployedModel }, "json");
      return;
    }

    // Precheck: verify the deployment is in a resumable state.
    if (!flags.skipPrecheck) {
      try {
        const entries = await listIndependentDeployedModels(ctx.client);
        const entry = findDeploymentEntry(entries, deployedModel);
        if (entry) {
          const status = (entry.status ?? "").toUpperCase();
          if (status && status !== "STOPPED") {
            throw new BailianError(
              `Deployment ${deployedModel} is ${status}. Only STOPPED deployments can be resumed. ` +
                `Pass --skip-precheck to attempt the resume anyway.`,
              ExitCode.USAGE,
            );
          }
        }
        // If entry not found in list, proceed — the server will surface the real error.
      } catch (error) {
        if (error instanceof BailianError) throw error;
        // If the list call itself failed, proceed and let the API call surface the error.
      }
    }

    const response = await startModelService(ctx.client, deployedModel);

    if (settings.quiet) {
      emitBare(deployedModel);
    } else {
      emitResult({ deployed_model: deployedModel, action: "resume", ...response }, "json");
    }
  },
});
