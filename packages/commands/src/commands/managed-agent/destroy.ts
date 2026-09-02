import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { destroyPlannedProjectResources, planDestroyProjectContext } from "@openagentpack/sdk";
import { formatResourceLabel } from "./_engine/address-utils.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const DESTROY_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  cascade: {
    type: "switch",
    description: {
      "en-US": "Auto-delete dependent resources (e.g. sessions referencing an environment)",
      "zh-CN": "自动删除依赖资源（例如引用某个环境的 Session）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Destroy all managed agent resources tracked in state",
    "zh-CN": "销毁 State 中跟踪的全部托管 Agent 资源",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This deletes every managed Agent resource tracked in state; --cascade may also delete dependent resources.",
      "zh-CN": "该操作会删除 State 中跟踪的全部托管 Agent 资源；--cascade 还可能删除依赖资源。",
    },
  },
  usageArgs: "[--file <path>] [--cascade]",
  flags: DESTROY_FLAGS,
  exampleArgs: ["--yes", "--yes --cascade"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      emitResult(
        {
          would_destroy: { cascade: Boolean(flags.cascade) },
          config_file: file,
          hint: "Run `managed-agent state list` to see the resources tracked in state.",
        },
        format,
      );
      return;
    }

    const planned = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        return planDestroyProjectContext(runtime);
      }),
    );

    const resources = planned.resources;
    if (resources.length === 0) {
      if (format === "json") emitResult({ destroyed: 0, total: 0 }, format);
      else emitBare("No resources in state. Nothing to destroy.");
      return;
    }

    // In --output json, stdout must stay a single-JSON data channel: the
    // resource preview is progress info → stderr; text mode keeps stdout.
    for (const resource of resources) {
      const line = `  - ${formatResourceLabel(resource.address)} [${resource.remote_id}]`;
      if (format === "json") process.stderr.write(`${line}\n`);
      else emitBare(line);
    }

    const result = await withAgentErrors(() =>
      withStdoutProtected(() =>
        destroyPlannedProjectResources(planned, {
          cascade: flags.cascade,
          onCascadeRequired: async () => Boolean(flags.cascade),
          onResourceResult: (item) => {
            const label = formatResourceLabel(item.resource.address);
            process.stderr.write(`  ${item.status === "success" ? "✓" : "✗"} ${label}\n`);
          },
        }),
      ),
    );

    if (format === "json") {
      emitResult({ destroyed: result.destroyed, total: result.resources.length }, format);
    } else {
      const status = result.partial ? "Destroy incomplete" : "Destroy complete";
      emitBare(`\n${status}. ${result.destroyed}/${result.resources.length} resources removed.`);
    }

    if (result.partial) {
      const firstFailure = result.results.find((item) => item.status !== "success");
      throw new BailianError(
        firstFailure?.error ||
          `Destroy incomplete: ${result.destroyed}/${result.resources.length} resources removed.`,
        ExitCode.GENERAL,
      );
    }
  },
});
