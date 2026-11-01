import { getRemoteEnvironment } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
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
    const environment = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteEnvironment(runtime, ctx.flags.environmentId, {
          provider: "bailian",
        });
      }),
    );
    ctx.output.result(environment, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              lines.push(`ID:          ${environment.id}`);
              lines.push(`Name:        ${displayValue(environment.name)}`);
              lines.push(`Description: ${displayValue(environment.description, 120)}`);
              lines.push(`Scope:       ${displayValue(environment.scope)}`);
              lines.push(`Version:     ${displayValue(environment.version)}`);
              lines.push(`Updated:     ${displayValue(environment.updated_at)}`);
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});
