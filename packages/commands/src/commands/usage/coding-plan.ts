import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { printQuotaBox, readNumber, type QuotaSection } from "./quota-box.ts";
import { formatNumber } from "../shared/format.ts";

const CODING_PLAN_USAGE_API =
  "zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2";

const COMMODITY_CODES: Record<string, string> = {
  domestic: "sfm_codingplan_public_cn",
  international: "sfm_codingplan_public_intl",
};

interface CodingPlanWindow {
  usedQuota?: number;
  totalQuota?: number;
  /** Usage ratio in [0, 1]; absent when the window has no positive total or no used value. */
  percentage?: number;
  resetTime?: number;
}

interface CodingPlanUsage {
  instanceType?: string;
  per5Hour: CodingPlanWindow;
  perWeek: CodingPlanWindow;
  perBillMonth: CodingPlanWindow;
}

function readWindow(
  quotaInfo: Record<string, unknown> | undefined,
  fieldPrefix: string,
): CodingPlanWindow {
  const window: CodingPlanWindow = {};
  if (!quotaInfo) return window;

  const usedQuota = readNumber(quotaInfo[`${fieldPrefix}UsedQuota`]);
  if (usedQuota !== undefined) window.usedQuota = usedQuota;
  const totalQuota = readNumber(quotaInfo[`${fieldPrefix}TotalQuota`]);
  if (totalQuota !== undefined) window.totalQuota = totalQuota;
  const resetTime = readNumber(quotaInfo[`${fieldPrefix}QuotaNextRefreshTime`]);
  if (resetTime !== undefined) window.resetTime = resetTime;

  // Console rule: the usage rate only exists with a positive total and a used value.
  if (usedQuota !== undefined && totalQuota !== undefined && totalQuota > 0) {
    window.percentage = usedQuota / totalQuota;
  }
  return window;
}

/** Pick the first VALID instance's quota info, mirroring the Coding Plan console. */
function readUsage(result: unknown): CodingPlanUsage | undefined {
  const response = unwrapResponse(result as Record<string, unknown>);
  const instances = Array.isArray(response.codingPlanInstanceInfos)
    ? (response.codingPlanInstanceInfos as Record<string, unknown>[])
    : [];
  const validInstance = instances.find((instance) => instance.status === "VALID");
  if (!validInstance) return undefined;

  const quotaInfo = validInstance.codingPlanQuotaInfo as Record<string, unknown> | undefined;
  const usage: CodingPlanUsage = {
    per5Hour: readWindow(quotaInfo, "per5Hour"),
    perWeek: readWindow(quotaInfo, "perWeek"),
    perBillMonth: readWindow(quotaInfo, "perBillMonth"),
  };
  if (typeof validInstance.instanceType === "string" && validInstance.instanceType) {
    usage.instanceType = validInstance.instanceType;
  }
  return usage;
}

function toSection(label: string, window: CodingPlanWindow): QuotaSection {
  const section: QuotaSection = {
    label,
    emptyMessage: "No quota data for this window; verify in the Bailian Coding Plan console.",
    percentage: window.percentage,
    resetTime: window.resetTime,
  };
  if (window.usedQuota !== undefined && window.totalQuota !== undefined) {
    section.detail = `Used: ${formatNumber(window.usedQuota)} / ${formatNumber(window.totalQuota)}`;
  }
  return section;
}

function printView(usage: CodingPlanUsage, generatedAt: number): void {
  const planSuffix = usage.instanceType ? ` (${usage.instanceType})` : "";
  printQuotaBox(
    `Coding Plan Usage${planSuffix}`,
    [
      toSection("5-hour quota", usage.per5Hour),
      toSection("1-week quota", usage.perWeek),
      toSection("Monthly quota", usage.perBillMonth),
    ],
    generatedAt,
  );
}

export default defineCommand({
  description: {
    "en-US": "Show Coding Plan quota usage",
    "zh-CN": "查看 Coding Plan 配额使用情况",
  },
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);
    const requestData = {
      queryCodingPlanInstanceInfoRequest: {
        commodityCode: COMMODITY_CODES[settings.consoleSite ?? "domestic"],
        onlyLatestOne: true,
      },
    };

    if (settings.dryRun) {
      emitResult({ api: CODING_PLAN_USAGE_API, data: requestData }, format);
      return;
    }

    const result = await ctx.client.console(CODING_PLAN_USAGE_API, requestData);
    const usage = readUsage(result);

    if (format === "json") {
      emitResult(usage ?? {}, format);
      return;
    }

    if (!usage) {
      process.stdout.write("No active Coding Plan subscription found.\n");
      return;
    }

    printView(usage, Date.now());
  },
});
