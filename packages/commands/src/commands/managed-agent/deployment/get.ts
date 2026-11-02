import { getRemoteDeployment } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
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
    const deployment = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteDeployment(runtime, ctx.flags.deploymentId, {
          provider: "bailian",
        });
      }),
    );
    ctx.output.result(deployment, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              {
                lines.push(`ID:      ${displayValue(deployment.id)}`);
                lines.push(`Status:  ${deployment.status}`);
                lines.push(`Schedule:${displayValue(deployment.schedule?.expression)}`);
                lines.push(`Paused:  ${displayValue(deployment.paused_reason)}`);
              }
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});
