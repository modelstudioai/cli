import { getRemoteEnvironment } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { displayValue } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { ENVIRONMENT_GET_FLAGS } from "./_shared.ts";

export default defineCommand({
  description: {
    "en-US": "Get a Managed Agent environment",
    "zh-CN": "获取托管 Agent 环境详情",
  },
  auth: "apiKey",
  usageArgs: "--environment-id <id>",
  flags: ENVIRONMENT_GET_FLAGS,
  exampleArgs: ["--environment-id env_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const environment = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteEnvironment(runtime, ctx.flags.environmentId, {
          provider: "bailian",
        });
      }),
    );
    if (format === "json") {
      emitResult(environment, format);
      return;
    }
    emitBare(`ID:          ${environment.id}`);
    emitBare(`Name:        ${displayValue(environment.name)}`);
    emitBare(`Description: ${displayValue(environment.description, 120)}`);
    emitBare(`Scope:       ${displayValue(environment.scope)}`);
    emitBare(`Version:     ${displayValue(environment.version)}`);
    emitBare(`Updated:     ${displayValue(environment.updated_at)}`);
  },
});
