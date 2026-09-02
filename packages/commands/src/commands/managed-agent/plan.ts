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
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { formatAgentDiagnosticFailure, withAgentErrors } from "./_engine/errors.ts";
import { renderAgentFeedback } from "./_engine/feedback.ts";

const PLAN_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  noRefresh: {
    type: "switch",
    description: {
      "en-US": "Skip refreshing state from remote before planning",
      "zh-CN": "规划前跳过从远端刷新状态",
    },
  },
  refreshOnly: {
    type: "switch",
    description: {
      "en-US": "Refresh state and show drift without planning remote mutations",
      "zh-CN": "刷新状态并显示漂移，不规划远端变更",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Show what changes would be applied to agent infrastructure",
    "zh-CN": "显示将应用到 Agent 基础设施的变更",
  },
  auth: "apiKey",
  usageArgs: "[--file <path>] [--no-refresh] [--refresh-only]",
  flags: PLAN_FLAGS,
  exampleArgs: ["", "--no-refresh"],
  notes: [
    ...CREDENTIALS_NOTE,
    {
      "en-US":
        "--no-refresh and --dry-run plan offline from local config and state: no remote requests, no state writes, provider keys are not checked.",
      "zh-CN":
        "--no-refresh 和 --dry-run 基于本地配置与 State 离线规划：不发送远端请求、不写入 State，也不检查 Provider Key。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    // Offline mode never talks to a provider and never saves refreshed state:
    // --no-refresh by explicit request, --dry-run by contract (read-only run).
    // Provider keys are skipped then; the bl login gate (auth: "apiKey") still
    // applies except under --dry-run (authStage's dry-run exemption).
    const offline = Boolean(flags.noRefresh) || settings.dryRun;

    const planned = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: offline ? "none" : "all",
        });
        return planProjectContext(runtime, {
          provider: "bailian",
          refresh: !offline,
          quiet: format === "json",
          onFeedback: format === "json" ? undefined : renderAgentFeedback,
        });
      }),
    );

    const plan = planned.plan;
    const hasErrors = plan.diagnostics.some((diag) => diag.severity === "error");
    const failureMessage = formatAgentDiagnosticFailure(plan.diagnostics, "Plan contains errors.");

    if (format === "json") {
      emitResult(plan, format);
      if (hasErrors) throw new BailianError(failureMessage, ExitCode.GENERAL);
      return;
    }

    for (const diag of plan.diagnostics) {
      emitBare(`[${diag.severity}] ${diag.code}: ${diag.message}`);
    }
    if (hasErrors) throw new BailianError(failureMessage, ExitCode.GENERAL);

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
