import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { importResource, parseStateAddress } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const STATE_IMPORT_FLAGS = {
  address: {
    type: "string",
    valueHint: "<provider.type.name>",
    description: "Resource state address (required)",
    required: true,
  },
  remoteId: {
    type: "string",
    valueHint: "<id>",
    description: "Existing remote resource ID to import (required)",
    required: true,
  },
  resourceVersion: {
    type: "number",
    valueHint: "<n>",
    description: "Resource version (for versioned resources like agents)",
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Import an existing remote resource into agents state",
  auth: "none",
  usageArgs:
    "--address <provider.type.name> --remote-id <id> [--resource-version <n>] [--file <path>]",
  flags: STATE_IMPORT_FLAGS,
  exampleArgs: ["--address bailian.agent.assistant --remote-id agent-abc123"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        const parsed = parseStateAddress(flags.address, {
          requireProvider: true,
        });
        await importResource(runtime, parsed, flags.remoteId, {
          resourceVersion: flags.resourceVersion,
        });
      }),
    );

    if (format === "json") {
      emitResult({ imported: flags.address, remote_id: flags.remoteId }, format);
    } else {
      emitBare(`Imported ${flags.address} (remote_id: ${flags.remoteId}) into state.`);
    }
  },
});
