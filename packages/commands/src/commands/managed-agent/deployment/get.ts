import { getRemoteDeployment } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { displayValue } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { DEPLOYMENT_GET_FLAGS } from "./_shared.ts";

export default defineCommand({
  description: {
    "en-US": "Get a Managed Agent deployment",
    "zh-CN": "获取托管 Agent Deployment 详情",
  },
  auth: "apiKey",
  usageArgs: "--deployment-id <id>",
  flags: DEPLOYMENT_GET_FLAGS,
  exampleArgs: ["--deployment-id dep_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const deployment = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteDeployment(runtime, ctx.flags.deploymentId, {
          provider: "bailian",
        });
      }),
    );
    if (format === "json") emitResult(deployment, format);
    else {
      emitBare(`ID:      ${displayValue(deployment.id)}`);
      emitBare(`Status:  ${deployment.status}`);
      emitBare(`Schedule:${displayValue(deployment.schedule?.expression)}`);
      emitBare(`Paused:  ${displayValue(deployment.paused_reason)}`);
    }
  },
});
