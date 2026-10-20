import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { printQuotaBox, readNumber } from "./quota-box.ts";

const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";

interface TokenPlanUsage {
  per1MonthPercentage?: number;
  per1MonthResetTime?: number;
}

function readUsage(result: unknown): TokenPlanUsage {
  const response = unwrapResponse(result as Record<string, unknown>);
  const usage: TokenPlanUsage = {};

  const per1MonthPercentage = readNumber(response.per1MonthPercentage);
  if (per1MonthPercentage !== undefined) usage.per1MonthPercentage = per1MonthPercentage;
  const per1MonthResetTime = readNumber(response.per1MonthResetTime);
  if (per1MonthResetTime !== undefined) usage.per1MonthResetTime = per1MonthResetTime;

  return usage;
}

function printView(usage: TokenPlanUsage, generatedAt: number): void {
  printQuotaBox(
    "Token Plan Usage",
    [
      {
        label: "Monthly quota",
        emptyMessage:
          "The monthly limit may be unlimited; verify in the Bailian Token Plan console.",
        percentage: usage.per1MonthPercentage,
        resetTime: usage.per1MonthResetTime,
      },
    ],
    generatedAt,
  );
}

export default defineCommand({
  description: {
    "en-US": "Show Token Plan quota usage",
    "zh-CN": "查看 Token Plan 配额使用情况",
  },
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ api: TOKEN_PLAN_USAGE_API, data: {} }, format);
      return;
    }

    const result = await ctx.client.console(TOKEN_PLAN_USAGE_API, {});
    const usage = readUsage(result);

    if (format === "json") {
      emitResult(usage, format);
      return;
    }

    printView(usage, Date.now());
  },
});
