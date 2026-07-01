import {
  defineCommand,
  detectOutputFormat,
  deleteDeployment,
  getDeployment,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

/**
 * `bl deploy delete` — destroy a deployment.
 *
 * Server-side precondition: status must be STOPPED or FAILED. We surface a
 * clear local hint for RUNNING / PENDING deployments before issuing the
 * DELETE call.
 */
export default defineCommand({
  description: "Delete a model deployment (must be STOPPED or FAILED)",
  usageArgs: "--deployed-model <id> [--yes] [--skip-precheck]",
  options: [
    {
      flag: "--deployed-model <id>",
      description: "Deployed model identifier (required)",
      required: true,
    },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
    {
      flag: "--skip-precheck",
      description: "Skip the local STOPPED/FAILED status precheck",
      type: "boolean",
    },
  ],
  exampleArgs: ["--deployed-model dep-...", "--deployed-model dep-... --yes"],
  async run(config: Config, flags: GlobalFlags) {
    const deployedModel = flags.deployedModel as string | undefined;
    if (!deployedModel) failIfMissing("deployed-model", "bl deploy delete --deployed-model <id>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "deploy.delete", deployed_model: deployedModel }, format);
      return;
    }

    // Precheck status unless skipped — surface a clear hint instead of letting
    // the server return a generic precondition error.
    if (!flags.skipPrecheck) {
      try {
        const get = await getDeployment(config, deployedModel!);
        const deployment = get.output ?? get.data;
        const status = (deployment?.status ?? "").toUpperCase();
        if (status && status !== "STOPPED" && status !== "FAILED") {
          throw new BailianError(
            `Deployment ${deployedModel} is ${status}. Only STOPPED / FAILED deployments can be deleted. ` +
              `Stop it first via the platform console, or pass --skip-precheck to attempt deletion anyway.`,
            ExitCode.USAGE,
          );
        }
      } catch (e) {
        if (e instanceof BailianError) throw e;
        // If the get itself failed (e.g. not found), let the DELETE call surface the real error.
      }
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      process.stderr.write(`Delete deployment ${deployedModel}?\n`);
      const ok = await promptConfirm({ message: "Proceed?", initialValue: false });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm deletion in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await deleteDeployment(config, deployedModel!);

    if (config.quiet) {
      emitBare(deployedModel!);
    } else if (format === "text") {
      emitBare(`Deleted ${deployedModel}.`);
    } else {
      emitResult(response, format);
    }
  },
});
