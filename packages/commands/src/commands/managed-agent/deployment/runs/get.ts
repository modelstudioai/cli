import { getRemoteDeploymentRun } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
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
    const format = detectOutputFormat(ctx.settings.output);
    const run = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteDeploymentRun(runtime, ctx.flags.runId, { provider: ctx.flags.provider });
      }),
    );
    if (format === "json") emitResult(run, format);
    else {
      emitBare(`ID:         ${run.id}`);
      emitBare(`Deployment: ${displayValue(run.deployment_id)}`);
      emitBare(`Session:    ${displayValue(run.session_id)}`);
      emitBare(`Status:     ${displayValue(run.status)}`);
      emitBare(`Created:    ${displayValue(run.created_at)}`);
      emitBare(`Error:      ${displayValue(run.error)}`);
    }
  },
});
