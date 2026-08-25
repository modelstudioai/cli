import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  executePlannedProject,
  planProjectContext,
  type PlannedAction,
  UserError,
} from "@openagentpack/sdk";
import { formatResourceLabel } from "./_engine/address-utils.ts";
import {
  assertProviderConfigured,
  buildAgentRuntime,
  CREDENTIALS_NOTE,
} from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { renderAgentFeedback } from "./_engine/feedback.ts";
import {
  commitAutomaticVersion,
  type PreparedAutomaticVersion,
  prepareAutomaticVersion,
  readVersionSource,
} from "@openagentpack/local-git";

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
  ci: {
    type: "switch",
    description: {
      "en-US": "Run non-interactively while blocking deletes and remote drift",
      "zh-CN": "以非交互模式运行，并阻止删除和远端漂移覆盖",
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
      "en-US": "Refresh state without mutating remote resources",
      "zh-CN": "仅刷新 State，不修改远端资源",
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
  usageArgs:
    "[--file <path>] [--provider <name>] [--yes | --ci] [--no-refresh] [--refresh-only] [--concurrency <n>]",
  flags: APPLY_FLAGS,
  exampleArgs: ["--yes", "--provider bailian --yes", "--ci"],
  notes: CREDENTIALS_NOTE,
  validate(flags) {
    if (flags.ci && flags.yes) return "--ci cannot be combined with --yes.";
    if (flags.ci && flags.noRefresh) {
      return "--ci requires remote state refresh and cannot be combined with --no-refresh.";
    }
    return undefined;
  },
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
            ci: flags.ci,
            refresh_only: flags.refreshOnly,
          },
          config_file: file,
          hint: "Run `managed-agent plan` to preview the exact resource changes.",
        },
        format,
      );
      return;
    }

    const versionSource = await readVersionSource(file);

    const { planned, runtime } = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        assertProviderConfigured(runtime, flags.provider);
        const planned = await planProjectContext(runtime, {
          provider: flags.provider,
          refresh: !flags.noRefresh,
          quiet: true,
          onFeedback: renderAgentFeedback,
        });
        return { planned, runtime };
      }),
    );

    const plan = planned.plan;
    // In --output json, stdout must stay a single-JSON data channel: diagnostics
    // and the action preview are progress info → stderr; text mode keeps stdout.
    const emitProgress = (line: string): void => {
      if (format === "json") process.stderr.write(`${line}\n`);
      else emitBare(line);
    };
    if (plan.diagnostics.some((diag) => diag.severity === "error")) {
      for (const diag of plan.diagnostics) {
        if (diag.severity === "error") emitProgress(`[error] ${diag.code}: ${diag.message}`);
      }
      throw new BailianError("Cannot apply: resolve the errors above first.", ExitCode.GENERAL);
    }

    const actionable = plan.actions.filter((action) => action.action !== "no-op");
    if (actionable.length === 0) {
      if (!flags.refreshOnly) {
        const preparedVersion = await prepareAutomaticVersion(
          runtime.configPath,
          versionSource.source,
        );
        await commitSuccessfulApplyVersion(preparedVersion, format);
      }
      if (format === "json")
        emitResult({ succeeded: 0, failed: 0, skipped: 0, results: [] }, format);
      else emitBare("No changes. Infrastructure is up-to-date.");
      return;
    }

    const creates = actionable.filter((action) => action.action === "create").length;
    const updates = actionable.filter((action) => action.action === "update").length;
    const deletes = planned.destructiveActions;
    if (flags.ci) assertCiApplyPolicy(actionable);

    for (const action of actionable) {
      const icon = action.action === "create" ? "+" : action.action === "update" ? "~" : "-";
      emitProgress(`  ${icon} ${formatResourceLabel(action.address)}`);
    }

    if (flags.refreshOnly) {
      if (format === "json") {
        emitResult(
          {
            refresh_only: true,
            actions: actionable,
            succeeded: 0,
            failed: 0,
            skipped: actionable.length,
          },
          format,
        );
      } else {
        emitBare("Refresh-only mode: no remote mutations were performed.");
      }
      return;
    }

    if (!flags.yes && !flags.ci) {
      throw new BailianError(
        `Refusing to apply ${actionable.length} change(s) (${creates} create, ${updates} update, ${deletes.length} destroy) without confirmation.`,
        ExitCode.USAGE,
        "Review with `bl managed-agent plan`, then re-run with --yes to apply.",
      );
    }

    const preparedVersion = await prepareAutomaticVersion(runtime.configPath, versionSource.source);

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

    if (failed > 0 || skipped > 0) {
      throw new BailianError(
        failed > 0 ? "Apply failed." : "Apply incomplete: one or more actions were skipped.",
        ExitCode.GENERAL,
      );
    }
    await commitSuccessfulApplyVersion(preparedVersion, format);
  },
});

export function assertCiApplyPolicy(actions: PlannedAction[]): void {
  const deletes = actions.filter((action) => action.action === "delete");
  if (deletes.length > 0) {
    throw new UserError(
      `CI policy blocked ${deletes.length} delete action(s). Review the plan and apply this destructive change through an explicitly approved workflow.`,
    );
  }
  const drifted = actions.filter(
    (action) => action.driftKind === "remote" || action.driftKind === "both",
  );
  if (drifted.length > 0) {
    throw new UserError(
      `CI policy blocked ${drifted.length} action(s) with remote drift. Review the remote changes before deciding whether YAML should overwrite them.`,
    );
  }
}

async function commitSuccessfulApplyVersion(
  prepared: PreparedAutomaticVersion | null,
  format: "text" | "json",
): Promise<void> {
  if (!prepared) return;
  const version = await commitAutomaticVersion(prepared);
  if (version && format !== "json") {
    emitBare(`Created local version ${version.short_commit} (${version.message}).`);
  }
}
