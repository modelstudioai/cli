import { getRemoteDeploymentRun } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
import { displayValue } from "../../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../../_engine/config-loader.ts";
import { withStdoutProtected } from "../../_engine/console-capture.ts";
import { withAgentErrors } from "../../_engine/errors.ts";
import { DEPLOYMENT_RUNS_GET_FLAGS } from "../_shared.ts";

export default defineCommand({
  description: {
    "en-US": "Get a Managed Agent deployment run",
    "zh-CN": "获取托管 Agent Deployment Run 详情",
  },
  auth: "apiKey",
  usageArgs: "--run-id <id>",
  flags: DEPLOYMENT_RUNS_GET_FLAGS,
  exampleArgs: ["--run-id run_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const run = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteDeploymentRun(runtime, ctx.flags.runId, { provider: "bailian" });
      }),
    );
    ctx.output.result(run, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              {
                lines.push(`ID:         ${run.id}`);
                lines.push(`Deployment: ${displayValue(run.deployment_id)}`);
                lines.push(`Session:    ${displayValue(run.session_id)}`);
                lines.push(`Status:     ${displayValue(run.status)}`);
                lines.push(`Created:    ${displayValue(run.created_at)}`);
                lines.push(`Error:      ${displayValue(run.error)}`);
              }
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});
