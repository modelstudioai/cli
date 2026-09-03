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
    risk: {
      level: "high",
      message: paused
        ? {
            "en-US":
              "This pauses the specified Managed Agent deployment and stops its scheduled executions until resumed.",
            "zh-CN": "该操作会暂停指定的托管 Agent Deployment，并停止其定时执行直至恢复。",
          }
        : {
            "en-US":
              "This resumes the specified Managed Agent deployment and may restart scheduled executions and related usage.",
            "zh-CN":
              "该操作会恢复指定的托管 Agent Deployment，可能重新开始定时执行并产生相关用量。",
          },
    },
    usageArgs: "(--deployment <name> | --deployment-id <id>)",
    flags: DEPLOYMENT_ACTION_TARGET_FLAGS,
    exampleArgs: [`--deployment daily-report --dry-run`, `--deployment-id dep_abc --yes`],
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
              provider: "bailian",
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
