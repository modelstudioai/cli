import { defineCommand, BailianError, ExitCode, detectOutputFormat } from "bailian-cli-core";
import { ansi, emitResult } from "bailian-cli-runtime";
import {
  FREE_TIER_API,
  FREE_TIER_ONLY_STATUS_API,
  OVERVIEW_API,
  USAGE_KEY_LABELS,
  extractFreeTierOnlyStatuses,
  extractOverviewData,
  extractQuotas,
  fetchAllModels,
  formatDate,
  pollTelemetryApi,
  printFreeTierTable,
  printUsageOverview,
  quotaRemainingPercent,
  type FreeTierQuota,
  type OverviewStatistic,
} from "./shared.ts";

/** Free-tier rows shown in the summary before the "+N more" hint. */
const TOP_N = 10;

export default defineCommand({
  description: {
    "en-US": "Show a unified usage summary: free-tier quota and recent usage overview",
    "zh-CN": "显示统一用量摘要：免费额度和近期用量概览",
  },
  auth: "console",
  usageArgs: "[--days <days>] [flags]",
  flags: {
    days: {
      type: "string",
      valueHint: "<days>",
      description: {
        "en-US": "Number of days for the usage overview (default: 7)",
        "zh-CN": "用量概览的天数（默认：7）",
      },
    },
  },
  exampleArgs: ["", "--days 30", "--output json"],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const daysFlag = Number(flags.days) || 7;
    const format = detectOutputFormat(settings.output);
    const workspaceId = settings.workspaceId;

    const endTime = Date.now();
    const startTime = endTime - daysFlag * 24 * 60 * 60 * 1000;

    if (settings.dryRun) {
      emitResult(
        {
          freeTier: { api: FREE_TIER_API },
          usage: workspaceId
            ? {
                api: OVERVIEW_API,
                data: {
                  reqDTO: {
                    startTime,
                    endTime,
                    modelCallSource: "Online",
                    filterWorkspaceId: workspaceId,
                  },
                },
              }
            : null,
        },
        format,
      );
      return;
    }

    // --- Free-tier quota (all models, urgency-sorted) ---
    const modelInfos = await fetchAllModels(ctx.client);
    const models = modelInfos.map((info) => info.name);
    const typeMap = new Map(modelInfos.map((info) => [info.name, info.type]));

    const [quotaResult, stopResult] = await Promise.all([
      ctx.client.console(FREE_TIER_API, { queryFreeTierQuotaRequest: { models } }),
      ctx.client.console(FREE_TIER_ONLY_STATUS_API, {
        queryFreeTierOnlyStatusRequest: { models },
      }),
    ]);

    const quotas = extractQuotas(quotaResult)
      .filter((quota) => quota.quotaStatus === "VALID" && quota.quotaInitTotal > 0)
      .sort((left, right) => {
        const pctLeft = left.quotaInitTotal ? left.quotaTotal / left.quotaInitTotal : 0;
        const pctRight = right.quotaInitTotal ? right.quotaTotal / right.quotaInitTotal : 0;
        return pctLeft - pctRight;
      });

    const stopStatuses = extractFreeTierOnlyStatuses(stopResult);
    const stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));

    // --- Usage overview (requires workspace) ---
    let overview: OverviewStatistic | undefined;
    if (workspaceId) {
      const result = await pollTelemetryApi(ctx.client, OVERVIEW_API, {
        startTime,
        endTime,
        modelCallSource: "Online",
        filterWorkspaceId: workspaceId,
      });
      if (!result) throw new BailianError("Request timed out.", ExitCode.TIMEOUT);
      overview = extractOverviewData(result);
    }

    if (format === "json") {
      const freeTier = quotas.map((quota: FreeTierQuota) => ({
        model: quota.model,
        type: typeMap.get(quota.model) || null,
        remaining: quota.quotaTotal,
        total: quota.quotaInitTotal,
        remainingPercent: quotaRemainingPercent(quota),
        expires: quota.quotaValidityPeriod ? formatDate(quota.quotaValidityPeriod) : null,
      }));
      emitResult(
        {
          period: { start: formatDate(startTime), end: formatDate(endTime), days: daysFlag },
          freeTier,
          usage: overview
            ? {
                modelsCalled: overview.modelCount ?? 0,
                successfulCalls: overview.callSuccessCount ?? 0,
                usages: (overview.usages ?? []).map((usage) => ({
                  key: usage.key,
                  value: usage.value,
                  unit: usage.unit,
                  label: USAGE_KEY_LABELS[usage.key]?.en ?? usage.key,
                })),
              }
            : null,
        },
        format,
      );
      return;
    }

    const color = ansi(process.stdout);
    process.stdout.write(
      `${color.bold("Usage Summary")} ${color.dim("·")} ${formatDate(endTime)}\n\n`,
    );

    if (quotas.length === 0) {
      process.stdout.write(color.dim("No active free-tier quota.") + "\n");
    } else {
      const visible = quotas.slice(0, TOP_N);
      const remaining = quotas.length - visible.length;
      printFreeTierTable({
        quotas: visible,
        stopMap,
        typeMap,
        title: `Free Tier Quota · ${quotas.length} models · sorted by urgency`,
        moreHint:
          remaining > 0
            ? `+ ${remaining} more · ${identity.binName} usage free to browse all`
            : undefined,
      });
    }

    process.stdout.write("\n");

    if (!workspaceId) {
      process.stdout.write(
        color.dim(
          `Usage overview skipped · set --workspace-id or \`${identity.binName} config set workspace_id <id>\` to include it.`,
        ) + "\n",
      );
    } else if (!overview) {
      process.stdout.write(color.dim("No usage data in this period.") + "\n");
    } else {
      printUsageOverview(overview, startTime, endTime, daysFlag);
    }
  },
});
