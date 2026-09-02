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
import { formatAgentDiagnosticFailure, withAgentErrors } from "./_engine/errors.ts";
import { renderAgentFeedback } from "./_engine/feedback.ts";

const APPLY_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Target provider (default: all configured)",
      "zh-CN": "目标 Provider（默认：全部已配置项）",
    },
  },
  yes: {
    type: "switch",
    description: {
      "en-US": "Confirm and apply without an interactive prompt (required to mutate)",
      "zh-CN": "无需交互提示直接确认并应用（执行变更时必填）",
    },
  },
  noRefresh: {
    type: "switch",
    description: {
      "en-US": "Skip refreshing state from remote before planning",
      "zh-CN": "规划前跳过从远端刷新状态",
    },
  },
  concurrency: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Max independent resources to apply in parallel (default 6, max 10)",
      "zh-CN": "最大并行应用资源数（默认：6，最多：10）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Apply planned changes to create/update/delete agent resources",
    "zh-CN": "应用规划的变更，创建、更新或删除 Agent 资源",
  },
  auth: "apiKey",
  usageArgs: "[--file <path>] [--provider <name>] [--yes] [--concurrency <n>]",
  flags: APPLY_FLAGS,
  exampleArgs: ["--yes", "--provider bailian --yes"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      emitResult(
        {
          would_apply: {
            provider: flags.provider ?? "all",
            refresh: !flags.noRefresh,
            concurrency: flags.concurrency,
          },
          config_file: file,
          hint: "Run `managed-agent plan` to preview the exact resource changes.",
        },
        format,
      );
      return;
    }

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
    // In --output json, stdout must stay a single-JSON data channel: diagnostics
    // and the action preview are progress info → stderr; text mode keeps stdout.
    const emitProgress = (line: string): void => {
      if (format === "json") process.stderr.write(`${line}\n`);
      else emitBare(line);
    };
    const errorDiagnostics = plan.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (errorDiagnostics.length > 0) {
      for (const diagnostic of errorDiagnostics) {
        emitProgress(`[error] ${diagnostic.code}: ${diagnostic.message}`);
      }
      throw new BailianError(
        formatAgentDiagnosticFailure(
          errorDiagnostics,
          "Cannot apply: resolve the errors above first.",
        ),
        ExitCode.GENERAL,
      );
    }

    const actionable = plan.actions.filter((action) => action.action !== "no-op");
    if (actionable.length === 0) {
      if (format === "json")
        emitResult({ succeeded: 0, failed: 0, skipped: 0, results: [] }, format);
      else emitBare("No changes. Infrastructure is up-to-date.");
      return;
    }

    const creates = actionable.filter((action) => action.action === "create").length;
    const updates = actionable.filter((action) => action.action === "update").length;
    const deletes = planned.destructiveActions;

    for (const action of actionable) {
      const icon = action.action === "create" ? "+" : action.action === "update" ? "~" : "-";
      emitProgress(`  ${icon} ${formatResourceLabel(action.address)}`);
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
    const failedResults = result.results.filter((entry) => entry.status === "failed");
    const failed = failedResults.length;
    const skipped = result.results.filter((entry) => entry.status === "skipped").length;

    if (format === "json") {
      emitResult({ succeeded, failed, skipped, results: result.results }, format);
    } else {
      emitBare(`\nApply finished: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped.`);
    }

    if (failed > 0) {
      const firstFailure = failedResults.find((entry) => entry.error);
      throw new BailianError(firstFailure?.error ?? "Apply failed.", ExitCode.GENERAL);
    }
  },
});
