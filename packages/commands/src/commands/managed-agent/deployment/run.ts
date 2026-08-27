import { runRemoteDeployment } from "@openagentpack/sdk";
import { BailianError, defineCommand, detectOutputFormat, ExitCode } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import {
  DEPLOYMENT_RUN_ACTION_FLAGS,
  resolveDeploymentTarget,
  validateDeploymentActionTarget,
} from "./_shared.ts";

export default defineCommand({
  description: {
    "en-US": "Run a Managed Agent deployment now",
    "zh-CN": "立即运行托管 Agent Deployment",
  },
  auth: "apiKey",
  usageArgs: "(--deployment <name> | --deployment-id <id>) --yes",
  flags: DEPLOYMENT_RUN_ACTION_FLAGS,
  exampleArgs: ["--deployment daily-report --dry-run", "--deployment-id dep_abc --yes"],
  notes: CREDENTIALS_NOTE,
  validate: validateDeploymentActionTarget,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    if (ctx.settings.dryRun) {
      emitResult(
        {
          would_run_deployment: ctx.flags.deploymentId ?? ctx.flags.deployment,
          target_kind: ctx.flags.deploymentId ? "id" : "state_name",
        },
        format,
      );
      return;
    }
    if (!ctx.flags.yes) {
      throw new BailianError(
        "Refusing to run the deployment without confirmation.",
        ExitCode.USAGE,
        "Re-run with --yes or preview with --dry-run.",
      );
    }
    const result = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        const deploymentId = await resolveDeploymentTarget(runtime, ctx.flags);
        return {
          deploymentId,
          run: await runRemoteDeployment(runtime, deploymentId, { provider: ctx.flags.provider }),
        };
      }),
    );
    if (format === "json")
      emitResult({ deployment_id: result.deploymentId, ...result.run }, format);
    else emitBare(`Deployment ${result.deploymentId} started. Run: ${result.run.run_id ?? "-"}`);
  },
});
