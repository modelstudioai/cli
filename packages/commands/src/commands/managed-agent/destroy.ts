import { BailianError, defineCommand, ExitCode, type FlagsDef } from "bailian-cli-core";
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

    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      ctx.output.result({
        would_destroy: { cascade: Boolean(flags.cascade) },
        config_file: file,
        hint: "Run `managed-agent state list` to see the resources tracked in state.",
      });
      return;
    }

    const planned = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        const planned = planDestroyProjectContext(runtime);
        return {
          ...planned,
          resources: planned.resources.filter(
            (resource) => resource.address.provider === "bailian",
          ),
          defaultMemoryStores: (planned.defaultMemoryStores ?? []).filter(
            (memoryStore) => memoryStore.provider === "bailian",
          ),
        };
      }),
    );

    const resources = planned.resources;
    if (resources.length === 0) {
      ctx.output.result(
        { destroyed: 0, total: 0 },
        {
          text:
            ctx.settings.output === "text"
              ? "No resources in state. Nothing to destroy."
              : undefined,
        },
      );
      return;
    }

    // Resource previews are process hints; the final summary owns stdout.
    for (const resource of resources) {
      const line = `  - ${formatResourceLabel(resource.address)} [${resource.remote_id}]`;
      ctx.output.info(line);
    }

    const result = await withAgentErrors(() =>
      withStdoutProtected(ctx, () =>
        destroyPlannedProjectResources(planned, {
          cascade: flags.cascade,
          onCascadeRequired: async () => Boolean(flags.cascade),
          onResourceResult: (item) => {
            const label = formatResourceLabel(item.resource.address);
            if (item.status === "success") ctx.output.info(`  ✓ ${label}`);
            else
              ctx.output.warning({
                code: "AGENT_DESTROY_RESOURCE_FAILED",
                message: item.error ?? {
                  "en-US": `Could not remove ${label}.`,
                  "zh-CN": `无法移除 ${label}。`,
                },
                details: {
                  status: item.status,
                  address: item.resource.address,
                  remote_id: item.resource.remote_id,
                },
              });
          },
        }),
      ),
    );

    ctx.output.result(
      { destroyed: result.destroyed, total: result.resources.length },
      {
        text:
          ctx.settings.output === "text"
            ? `\n${result.partial ? "Destroy incomplete" : "Destroy complete"}. ${result.destroyed}/${result.resources.length} resources removed.`
            : undefined,
      },
    );

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
