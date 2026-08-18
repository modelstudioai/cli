import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { printQuotaBox, readNumber } from "./quota-box.ts";

const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";

interface TokenPlanUsage {
  per5HourPercentage?: number;
  per5HourResetTime?: number;
  per1WeekPercentage?: number;
  per1WeekResetTime?: number;
}

function readUsage(result: unknown): TokenPlanUsage {
  const response = unwrapResponse(result as Record<string, unknown>);
  const usage: TokenPlanUsage = {};

  const per5HourPercentage = readNumber(response.per5HourPercentage);
  if (per5HourPercentage !== undefined) usage.per5HourPercentage = per5HourPercentage;
  const per5HourResetTime = readNumber(response.per5HourResetTime);
  if (per5HourResetTime !== undefined) usage.per5HourResetTime = per5HourResetTime;
  const per1WeekPercentage = readNumber(response.per1WeekPercentage);
  if (per1WeekPercentage !== undefined) usage.per1WeekPercentage = per1WeekPercentage;
  const per1WeekResetTime = readNumber(response.per1WeekResetTime);
  if (per1WeekResetTime !== undefined) usage.per1WeekResetTime = per1WeekResetTime;

  return usage;
}

function printView(usage: TokenPlanUsage, generatedAt: number): void {
  printQuotaBox(
    "Token Plan Usage",
    [
      {
        label: "5-hour quota",
        emptyMessage:
          "The 5-hour limit may be unlimited; verify in the Bailian Token Plan console.",
        percentage: usage.per5HourPercentage,
        resetTime: usage.per5HourResetTime,
      },
      {
        label: "1-week quota",
        emptyMessage:
          "The 1-week limit may be unlimited; verify in the Bailian Token Plan console.",
        percentage: usage.per1WeekPercentage,
        resetTime: usage.per1WeekResetTime,
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
