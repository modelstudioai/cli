import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { executePlannedProject, planProjectContext } from "@openagentpack/sdk";
import { formatResourceLabel } from "./_engine/address-utils.ts";
import {
  assertProviderConfigured,
  buildAgentRuntime,
  CREDENTIALS_NOTE,
} from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { renderAgentFeedback } from "./_engine/feedback.ts";

const APPLY_FLAGS = {
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
  yes: {
    type: "switch",
    description: "Confirm and apply without an interactive prompt (required to mutate)",
  },
  noRefresh: {
    type: "switch",
    description: "Skip refreshing state from remote before planning",
  },
  concurrency: {
    type: "number",
    valueHint: "<n>",
    description: "Max independent resources to apply in parallel (default 6, max 10)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Apply planned changes to create/update/delete agent resources",
  auth: "none",
  usageArgs: "[--file <path>] [--provider <name>] [--yes] [--concurrency <n>]",
  flags: APPLY_FLAGS,
  exampleArgs: ["--yes", "--provider bailian --yes"],
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
          quiet: true,
          onFeedback: renderAgentFeedback,
        });
      }),
    );

    const plan = planned.plan;
    if (plan.diagnostics.some((diag) => diag.severity === "error")) {
      for (const diag of plan.diagnostics) {
        if (diag.severity === "error") emitBare(`[error] ${diag.code}: ${diag.message}`);
      }
      throw new BailianError("Cannot apply: resolve the errors above first.", ExitCode.GENERAL);
    }

    const actionable = plan.actions.filter((action) => action.action !== "no-op");
    if (actionable.length === 0) {
      emitBare("No changes. Infrastructure is up-to-date.");
      return;
    }

    const creates = actionable.filter((action) => action.action === "create").length;
    const updates = actionable.filter((action) => action.action === "update").length;
    const deletes = planned.destructiveActions;

    for (const action of actionable) {
      const icon = action.action === "create" ? "+" : action.action === "update" ? "~" : "-";
      emitBare(`  ${icon} ${formatResourceLabel(action.address)}`);
    }

    if (!flags.yes) {
      throw new BailianError(
        `Refusing to apply ${actionable.length} change(s) (${creates} create, ${updates} update, ${deletes.length} destroy) without confirmation.`,
        ExitCode.USAGE,
        "Review with `bl managed-agent plan`, then re-run with --yes to apply.",
      );
    }

    const result = await withAgentErrors(() =>
      withStdoutProtected(() =>
        executePlannedProject(planned, {
          onFeedback: renderAgentFeedback,
          policy: "force",
          concurrency: flags.concurrency,
        }),
      ),
    );

    const succeeded = result.results.filter((entry) => entry.status === "success").length;
    const failed = result.results.filter((entry) => entry.status === "failed").length;
    const skipped = result.results.filter((entry) => entry.status === "skipped").length;

    if (format === "json") {
      emitResult({ succeeded, failed, skipped, results: result.results }, format);
    } else {
      emitBare(`\nApply finished: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped.`);
    }

    if (failed > 0) throw new BailianError("Apply failed.", ExitCode.GENERAL);
  },
});
