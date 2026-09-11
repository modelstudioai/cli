import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { importResource, parseStateAddress } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const STATE_IMPORT_FLAGS = {
  address: {
    type: "string",
    valueHint: "<bailian.type.name>",
    description: {
      "en-US": "Resource state address (required)",
      "zh-CN": "资源 State 地址（必填）",
    },
    required: true,
  },
  remoteId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Existing remote resource ID to import (required)",
      "zh-CN": "要导入的已有远端资源 ID（必填）",
    },
    required: true,
  },
  resourceVersion: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Resource version (for versioned resources like agents)",
      "zh-CN": "资源版本（用于 Agent 等带版本的资源）",
    },
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

function parseBailianStateAddress(address: string) {
  const parsed = parseStateAddress(address, { requireProvider: true });
  if (parsed.provider !== "bailian") {
    throw new BailianError(
      `bl managed-agent can import only Bailian resources; address provider was '${parsed.provider}'. / bl managed-agent 只能导入百炼资源；地址中的 Provider 为 '${parsed.provider}'。`,
      ExitCode.USAGE,
    );
  }
  return parsed;
}

export default defineCommand({
  description: {
    "en-US": "Import an existing remote resource into agents state",
    "zh-CN": "将已有远端资源导入 Agent State",
  },
  auth: "apiKey",
  usageArgs:
    "--address <bailian.type.name> --remote-id <id> [--resource-version <n>] [--file <path>]",
  flags: STATE_IMPORT_FLAGS,
  exampleArgs: ["--address bailian.agent.assistant --remote-id agent-abc123"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      // Validate the address shape locally so dry-run still catches usage errors.
      await withAgentErrors(async () => {
        parseBailianStateAddress(flags.address);
      });
      emitResult(
        {
          would_import: flags.address,
          remote_id: flags.remoteId,
          resource_version: flags.resourceVersion,
          config_file: file,
        },
        format,
      );
      return;
    }

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        // Parse first so a malformed address fails fast, before any config I/O.
        const parsed = parseBailianStateAddress(flags.address);
        const runtime = await buildAgentRuntime(ctx, file);
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
