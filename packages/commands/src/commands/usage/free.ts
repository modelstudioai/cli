import { defineCommand, detectOutputFormat, findModelByName } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  FREE_TIER_API,
  FREE_TIER_ONLY_STATUS_API,
  extractQuotas,
  extractFreeTierOnlyStatuses,
  fetchAllModels,
  resolveModelType,
  formatDate,
  printFreeTierTable,
  quotaRemainingPercent,
  type FreeTierQuota,
} from "./shared.ts";

/** Rows shown by default when listing all models; the rest go behind a hint. */
const TOP_N = 15;

export default defineCommand({
  description: "Query free-tier quota for models (all models if --model is omitted)",
  auth: "console",
  usageArgs: "[--model <model>[,model2,...]] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model name(s) to query, comma-separated for multiple; omit for all models",
    },
    expiring: {
      type: "string",
      valueHint: "<days>",
      description: "Only show quotas expiring within N days",
    },
    sort: {
      type: "string",
      valueHint: "<field>",
      description: "Sort by: remaining (ascending), expires (ascending)",
      choices: ["remaining", "expires"] as const,
    },
    all: {
      type: "switch",
      description: "Show all models instead of the top rows",
    },
  },
  exampleArgs: [
    "",
    "--model qwen3-max",
    "--model qwen3-max,qwen-turbo",
    "--expiring 30",
    "--sort remaining",
    "--all",
    "--model qwen-turbo --output json",
    "--model qwen3-max --console-region cn-beijing",
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const expiringDays = Number(flags.expiring) || 0;
    const sortField = flags.sort || undefined;
    const showAll = Boolean(flags.all);
    const format = detectOutputFormat(settings.output);

    let models: string[];
    const typeMap = new Map<string, string>();

    if (modelFlag) {
      models = [
        ...new Set(
          modelFlag
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];
    } else {
      models = [];
    }

    const requestData = {
      queryFreeTierQuotaRequest: { models },
    };

    if (settings.dryRun) {
      emitResult({ api: FREE_TIER_API, data: requestData }, format);
      return;
    }

    if (!modelFlag) {
      const modelInfos = await fetchAllModels(ctx.client);
      models = modelInfos.map((info) => info.name);
      for (const info of modelInfos) {
        typeMap.set(info.name, info.type);
      }
      requestData.queryFreeTierQuotaRequest.models = models;
    } else {
      const matches = await Promise.all(
        models.map((name) => findModelByName((api, data) => ctx.client.console(api, data), name)),
      );
      for (let idx = 0; idx < models.length; idx++) {
        const matched = matches[idx];
        if (matched) {
          typeMap.set(models[idx], resolveModelType((matched.capabilities as string[]) || []));
        }
      }
    }

    const quotaResult = await ctx.client.console(FREE_TIER_API, requestData);

    const allQuotas = extractQuotas(quotaResult);
    let quotas = modelFlag
      ? allQuotas
      : allQuotas.filter((quota) => quota.quotaStatus === "VALID" && quota.quotaInitTotal > 0);

    if (expiringDays > 0) {
      const cutoff = Date.now() + expiringDays * 24 * 60 * 60 * 1000;
      quotas = quotas.filter(
        (quota) => quota.quotaValidityPeriod > 0 && quota.quotaValidityPeriod <= cutoff,
      );
    }

    // Default to urgency ordering (least remaining first) when browsing all models.
    const effectiveSort = sortField ?? (modelFlag ? undefined : "remaining");
    if (effectiveSort === "remaining") {
      quotas.sort((left, right) => {
        const pctLeft = left.quotaInitTotal ? left.quotaTotal / left.quotaInitTotal : 0;
        const pctRight = right.quotaInitTotal ? right.quotaTotal / right.quotaInitTotal : 0;
        return pctLeft - pctRight;
      });
    } else if (effectiveSort === "expires") {
      quotas.sort(
        (left, right) => (left.quotaValidityPeriod ?? 0) - (right.quotaValidityPeriod ?? 0),
      );
    }

    // Query auto-stop status only for the filtered models (the full catalog can
    // exceed the status API's batch limit and trigger a server-side error).
    const filteredModels = quotas.map((quota) => quota.model);
    const stopResult = filteredModels.length
      ? await ctx.client.console(FREE_TIER_ONLY_STATUS_API, {
          queryFreeTierOnlyStatusRequest: { models: filteredModels },
        })
      : null;

    const stopStatuses = stopResult ? extractFreeTierOnlyStatuses(stopResult) : [];
    const stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));

    if (format === "json") {
      const items = quotas.map((quota: FreeTierQuota) => {
        const hasQuota = quota.quotaInitTotal != null && quota.quotaTotal != null;
        const used = hasQuota ? quota.quotaInitTotal - quota.quotaTotal : 0;
        const stopStatus = stopMap.get(quota.model);
        const autoStop =
          stopStatus === true
            ? true
            : stopStatus === false
              ? false
              : quota.quotaStatus === "UNKNOWN"
                ? "unsupported"
                : null;
        return {
          model: quota.model,
          type: typeMap.get(quota.model) || null,
          remaining: hasQuota ? quota.quotaTotal : null,
          total: hasQuota ? quota.quotaInitTotal : null,
          usagePercent:
            hasQuota && quota.quotaInitTotal > 0
              ? Math.round((used / quota.quotaInitTotal) * 1000) / 10
              : null,
          remainingPercent: quotaRemainingPercent(quota),
          expires: quota.quotaValidityPeriod ? formatDate(quota.quotaValidityPeriod) : null,
          autoStop,
        };
      });
      emitResult(items, format);
      return;
    }

    if (quotas.length === 0) {
      process.stdout.write("No free-tier quota found.\n");
      return;
    }

    const browseAll = !modelFlag && !showAll;
    const visible = browseAll ? quotas.slice(0, TOP_N) : quotas;
    const remaining = quotas.length - visible.length;

    const titleSuffix = effectiveSort === "remaining" ? " · sorted by urgency" : "";
    printFreeTierTable({
      quotas: visible,
      stopMap,
      typeMap,
      title: `Free Tier Quota · ${quotas.length} models${titleSuffix}`,
      moreHint:
        remaining > 0
          ? `+ ${remaining} more · ${identity.binName} usage free --all to browse all`
          : undefined,
    });
  },
});
