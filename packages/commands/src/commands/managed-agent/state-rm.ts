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

const STATE_RM_FLAGS = {
  address: {
    type: "string",
    valueHint: "<provider.type.name>",
    description: {
      "en-US": "Resource state address (required)",
      "zh-CN": "资源 State 地址（必填）",
    },
    required: true,
  },
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
    "en-US": "Remove a resource from state without destroying it remotely",
    "zh-CN": "从 State 中移除资源，但不销毁远端资源",
  },
  auth: "none",
  usageArgs: "--address <provider.type.name> [--file <path>]",
  flags: STATE_RM_FLAGS,
  exampleArgs: ["--address bailian.agent.assistant"],
  notes: OFFLINE_NOTE,
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
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: "none",
        });
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
