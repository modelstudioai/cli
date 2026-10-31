import { defineCommand, type FlagsDef } from "bailian-cli-core";
import { formatTable } from "bailian-cli-runtime";
import { buildAgentRuntime, OFFLINE_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const STATE_LIST_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List resources tracked in agents state",
    "zh-CN": "列出 Agent State 中跟踪的资源",
  },
  auth: "none",
  usageArgs: "[--file <path>]",
  flags: STATE_LIST_FLAGS,
  exampleArgs: ["", "--file agents.yaml"],
  notes: OFFLINE_NOTE,
  async run(ctx) {
    const { flags } = ctx;

    const file = flags.file ?? "agents.yaml";

    const resources = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: "none",
        });
        return runtime.state.listResources();
      }),
    );

    const text =
      ctx.settings.output === "text"
        ? (() => {
            const lines: string[] = [];
            if (resources.length === 0) {
              lines.push("No resources tracked in state.");
              return lines.join("\n");
            }

            const headers = ["TYPE", "NAME", "PROVIDER", "REMOTE ID"];
            const rows = resources.map((resource) => [
              resource.address.type,
              resource.address.name,
              resource.address.provider,
              resource.remote_id ?? "(local)",
            ]);
            for (const line of formatTable(headers, rows)) lines.push(line);
            lines.push(`\nTotal: ${resources.length}`);

            return lines.join("\n");
          })()
        : undefined;
    ctx.output.result({ resources }, { text });
  },
});
