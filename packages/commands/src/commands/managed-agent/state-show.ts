import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { parseStateAddress } from "@openagentpack/sdk";
import { buildAgentRuntime, OFFLINE_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const STATE_SHOW_FLAGS = {
  address: {
    type: "string",
    valueHint: "<provider.type.name>",
    description: "Resource state address (required)",
    required: true,
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Show details of a resource in agents state",
  auth: "none",
  usageArgs: "--address <provider.type.name> [--file <path>]",
  flags: STATE_SHOW_FLAGS,
  exampleArgs: ["--address bailian.agent.assistant"],
  notes: OFFLINE_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const found = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: "none",
        });
        const parsed = parseStateAddress(flags.address, {
          requireProvider: false,
        });
        return runtime.state.findResource(parsed);
      }),
    );

    if (!found) {
      throw new BailianError(`Resource not found: ${flags.address}`, ExitCode.GENERAL);
    }

    if (format === "json") emitResult(found, format);
    else emitBare(JSON.stringify(found, null, 2));
  },
});
