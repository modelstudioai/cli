import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { planProjectContext } from "@openagentpack/sdk";
import { formatResourceLabel } from "./_engine/address-utils.ts";
import {
  assertProviderConfigured,
  buildAgentRuntime,
  CREDENTIALS_NOTE,
} from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { renderAgentFeedback } from "./_engine/feedback.ts";

const PLAN_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Target provider (default: all configured)",
  },
  noRefresh: {
    type: "switch",
    description: "Skip refreshing state from remote before planning",
  },
  refreshOnly: {
    type: "switch",
    description: "Refresh state and show drift without planning remote mutations",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Show what changes would be applied to agent infrastructure",
  auth: "apiKey",
  usageArgs: "[--file <path>] [--provider <name>] [--no-refresh] [--refresh-only]",
  flags: PLAN_FLAGS,
  exampleArgs: ["", "--provider bailian", "--no-refresh"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const planned = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        assertProviderConfigured(runtime, flags.provider);
        return planProjectContext(runtime, {
          provider: flags.provider,
          refresh: !flags.noRefresh,
          quiet: format === "json",
          onFeedback: format === "json" ? undefined : renderAgentFeedback,
        });
      }),
    );

    const plan = planned.plan;
    const hasErrors = plan.diagnostics.some((diag) => diag.severity === "error");

    if (format === "json") {
      emitResult(plan, format);
      if (hasErrors) throw new BailianError("Plan contains errors.", ExitCode.GENERAL);
      return;
    }

    for (const diag of plan.diagnostics) {
      emitBare(`[${diag.severity}] ${diag.code}: ${diag.message}`);
    }
    if (hasErrors) throw new BailianError("Plan contains errors.", ExitCode.GENERAL);

    const creates = plan.actions.filter((action) => action.action === "create");
    const updates = plan.actions.filter((action) => action.action === "update");
    const deletes = plan.actions.filter((action) => action.action === "delete");

    if (creates.length + updates.length + deletes.length === 0) {
      emitBare("No changes. Infrastructure is up-to-date.");
      if (flags.refreshOnly) emitBare("Refresh-only mode: no remote mutations were performed.");
      return;
    }

    emitBare("\nPlanned actions:\n");
    for (const action of creates) emitBare(`  + ${formatResourceLabel(action.address)}`);
    for (const action of updates) {
      emitBare(`  ~ ${formatResourceLabel(action.address)}`);
      if (action.reason) emitBare(`    ${action.reason}`);
    }
    for (const action of deletes) emitBare(`  - ${formatResourceLabel(action.address)}`);
    emitBare(
      `\nPlan: ${creates.length} to create, ${updates.length} to update, ${deletes.length} to destroy.`,
    );
    if (flags.refreshOnly) emitBare("Refresh-only mode: no remote mutations will be performed.");
  },
});
