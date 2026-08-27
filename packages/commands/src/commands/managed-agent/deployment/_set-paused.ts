import { setRemoteDeploymentPaused } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import {
  DEPLOYMENT_ACTION_TARGET_FLAGS,
  resolveDeploymentTarget,
  validateDeploymentActionTarget,
} from "./_shared.ts";

export function createSetDeploymentPausedCommand(paused: boolean) {
  return defineCommand({
    description: paused
      ? { "en-US": "Pause a Managed Agent deployment", "zh-CN": "暂停托管 Agent Deployment" }
      : { "en-US": "Unpause a Managed Agent deployment", "zh-CN": "恢复托管 Agent Deployment" },
    auth: "apiKey",
    usageArgs: "(--deployment <name> | --deployment-id <id>)",
    flags: DEPLOYMENT_ACTION_TARGET_FLAGS,
    exampleArgs: [`--deployment daily-report --dry-run`, `--deployment-id dep_abc`],
    notes: CREDENTIALS_NOTE,
    validate: validateDeploymentActionTarget,
    async run(ctx) {
      const format = detectOutputFormat(ctx.settings.output);
      if (ctx.settings.dryRun) {
        emitResult(
          {
            [paused ? "would_pause_deployment" : "would_unpause_deployment"]:
              ctx.flags.deploymentId ?? ctx.flags.deployment,
            target_kind: ctx.flags.deploymentId ? "id" : "state_name",
          },
          format,
        );
        return;
      }
      const result = await withAgentErrors(() =>
        withStdoutProtected(async () => {
          const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
          const deploymentId = await resolveDeploymentTarget(runtime, ctx.flags);
          return {
            deploymentId,
            deployment: await setRemoteDeploymentPaused(runtime, deploymentId, paused, {
              provider: ctx.flags.provider,
            }),
          };
        }),
      );
      if (format === "json") {
        emitResult({ deployment_id: result.deploymentId, deployment: result.deployment }, format);
      } else {
        emitBare(`Deployment ${result.deploymentId} ${paused ? "paused" : "unpaused"}.`);
      }
    },
  });
}
