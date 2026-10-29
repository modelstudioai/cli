import { defineCommand, unwrapResponse } from "bailian-cli-core";
import { renderQuotaBox, readNumber } from "./quota-box.ts";

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

function renderView(usage: TokenPlanUsage, generatedAt: number): string {
  return renderQuotaBox(
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
    const format = settings.output;

    if (settings.dryRun) {
      ctx.output.result({ api: TOKEN_PLAN_USAGE_API, data: {} });
      return;
    }

    const result = await ctx.client.console(TOKEN_PLAN_USAGE_API, {});
    const usage = readUsage(result);

    ctx.output.result(
      usage,
      format === "text" ? { text: renderView(usage, Date.now()) } : undefined,
    );
  },
});
