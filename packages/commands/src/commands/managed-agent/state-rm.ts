import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { parseStateAddress } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
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
  auth: "apiKey",
  usageArgs: "--address <provider.type.name> [--file <path>]",
  flags: STATE_RM_FLAGS,
  exampleArgs: ["--address bailian.agent.assistant"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      // Validate the address shape locally so dry-run still catches usage errors.
      await withAgentErrors(async () => {
        parseStateAddress(flags.address, { requireProvider: false });
      });
      emitResult({ would_remove: flags.address, config_file: file }, format);
      return;
    }

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        const parsed = parseStateAddress(flags.address, {
          requireProvider: false,
        });
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
