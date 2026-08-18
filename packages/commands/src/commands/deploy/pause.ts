import {
  defineCommand,
  stopModelService,
  listIndependentDeployedModels,
  findDeploymentEntry,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const PAUSE_FLAGS = {
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
      "en-US": "Skip the local RUNNING/PENDING status precheck",
      "zh-CN": "跳过本地 RUNNING/PENDING 状态预检查",
    },
  },
} satisfies FlagsDef;

/**
 * `bl deploy pause` — pause a running deployment.
 *
 * Takes the model service offline so it no longer serves inference requests.
 * For mu/ptu plans, billing stops while paused.
 * Precheck: status must be RUNNING or PENDING.
 */
export default defineCommand({
  description: {
    "en-US": "Pause a running model deployment (stops billing for mu/ptu)",
    "zh-CN": "暂停运行中的模型部署（mu/ptu 方案将停止计费）",
  },
  auth: "console",
  usageArgs: "--deployed-model <id> [--skip-precheck]",
  flags: PAUSE_FLAGS,
  exampleArgs: [
    "--deployed-model dep-...",
    "--deployed-model dep-... --skip-precheck",
    "--deployed-model dep-... --dry-run",
  ],
  notes: [
    {
      "en-US":
        "While paused, billing ceases for mu/ptu plans. Use `deploy resume` to bring it back online or `deploy delete` to remove.",
      "zh-CN":
        "暂停期间，mu/ptu 方案将停止计费。使用 `deploy resume` 恢复服务，或使用 `deploy delete` 删除部署。",
    },
    {
      "en-US":
        "Precheck verifies status is RUNNING/PENDING before issuing the pause; pass --skip-precheck to bypass.",
      "zh-CN":
        "发起暂停前会预检查部署状态是否为 RUNNING/PENDING；可传入 --skip-precheck 跳过检查。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const deployedModel = flags.deployedModel;

    if (settings.dryRun) {
      emitResult({ action: "deploy.pause", deployed_model: deployedModel }, "json");
      return;
    }

    // Precheck: verify the deployment is in a pausable state.
    if (!flags.skipPrecheck) {
      try {
        const entries = await listIndependentDeployedModels(ctx.client);
        const entry = findDeploymentEntry(entries, deployedModel);
        if (entry) {
          const status = (entry.status ?? "").toUpperCase();
          if (status && status !== "RUNNING" && status !== "PENDING") {
            throw new BailianError(
              `Deployment ${deployedModel} is ${status}. Only RUNNING / PENDING deployments can be paused. ` +
                `Pass --skip-precheck to attempt the pause anyway.`,
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

    const response = await stopModelService(ctx.client, deployedModel);

    if (settings.quiet) {
      emitBare(deployedModel);
    } else {
      emitResult({ deployed_model: deployedModel, action: "pause", ...response }, "json");
    }
  },
});
