import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
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
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const resources = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: "none",
        });
        return runtime.state.listResources();
      }),
    );

    if (format === "json") {
      emitResult({ resources }, format);
      return;
    }
    if (resources.length === 0) {
      emitBare("No resources tracked in state.");
      return;
    }

    const headers = ["TYPE", "NAME", "PROVIDER", "REMOTE ID"];
    const rows = resources.map((resource) => [
      resource.address.type,
      resource.address.name,
      resource.address.provider,
      resource.remote_id ?? "(local)",
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    emitBare(`\nTotal: ${resources.length}`);
  },
});
