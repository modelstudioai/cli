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
    description: {
      "en-US": "Deployed model identifier (required)",
      "zh-CN": "已部署模型标识（必填）",
    },
    required: true,
  },
  skipPrecheck: {
    type: "switch",
    description: {
      "en-US": "Skip the local STOPPED status precheck",
      "zh-CN": "跳过本地 STOPPED 状态预检查",
    },
  },
} satisfies FlagsDef;

/**
 * `bl deploy resume` — resume a paused deployment.
 *
 * Brings the model service back online so it can serve inference requests.
 * Precheck: status must be STOPPED.
 */
export default defineCommand({
  description: {
    "en-US": "Resume a paused model deployment (brings service back online)",
    "zh-CN": "恢复已暂停的模型部署（使服务重新上线）",
  },
  auth: "console",
  usageArgs: "--deployed-model <id> [--skip-precheck]",
  flags: RESUME_FLAGS,
  exampleArgs: [
    "--deployed-model dep-...",
    "--deployed-model dep-... --skip-precheck",
    "--deployed-model dep-... --dry-run",
  ],
  notes: [
    {
      "en-US":
        "Precheck verifies status is STOPPED before issuing the resume; pass --skip-precheck to bypass.",
      "zh-CN": "发起恢复前会预检查部署状态是否为 STOPPED；可传入 --skip-precheck 跳过检查。",
    },
    {
      "en-US": "For mu/ptu plans, billing resumes once the service is back online.",
      "zh-CN": "对于 mu/ptu 方案，服务重新上线后将恢复计费。",
    },
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
