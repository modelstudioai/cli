import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const STATE_LIST_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List resources tracked in agents state",
  auth: "apiKey",
  usageArgs: "[--file <path>]",
  flags: STATE_LIST_FLAGS,
  exampleArgs: ["", "--file agents.yaml"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const resources = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
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
