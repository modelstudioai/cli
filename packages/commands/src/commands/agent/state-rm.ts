import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { parseStateAddress } from "@openagentpack/sdk";
import { buildAgentRuntime } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const STATE_RM_FLAGS = {
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
  description: "Remove a resource from state without destroying it remotely",
  auth: "none",
  usageArgs: "--address <provider.type.name> [--file <path>]",
  flags: STATE_RM_FLAGS,
  exampleArgs: ["--address bailian.agent.assistant"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(file);
        const parsed = parseStateAddress(flags.address, { requireProvider: false });
        const found = runtime.state.findResource(parsed);
        if (!found) {
          throw new BailianError(`Resource not found: ${flags.address}`, ExitCode.GENERAL);
        }
        runtime.state.removeResource(found.address);
        await runtime.state.save();
      }),
    );

    const message = `Removed ${flags.address} from state (remote resource not deleted).`;
    if (format === "json") emitResult({ removed: flags.address }, format);
    else emitBare(message);
  },
});
