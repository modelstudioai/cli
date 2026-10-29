import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { printQuotaBox, readNumber, type QuotaSection } from "./quota-box.ts";

const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";

/** Quota window fields look like per5HourPercentage / per1WeekResetTime / per1MonthPercentage. */
const WINDOW_FIELD_PATTERN = /^per(\d+)(Hour|Day|Week|Month)(Percentage|ResetTime)$/;

/** Personal plans are metered monthly; render an empty monthly window when the API returns none. */
const DEFAULT_WINDOW_KEY = "per1Month";

const UNIT_HOURS: Record<string, number> = { Hour: 1, Day: 24, Week: 24 * 7, Month: 24 * 30 };

interface TokenPlanWindow {
  /** Field prefix, e.g. per1Month. */
  key: string;
  count: number;
  unit: string;
  percentage?: number;
  resetTime?: number;
}

/**
 * JSON output: keeps the API's per* quota fields as-is; hasQuotaData tells whether any usage
 * ratio was read, so consumers can tell "no data" apart from a normal result.
 */
type TokenPlanUsage = Record<string, number | boolean>;

/** Discover windows from the per* fields actually present, so metering changes don't break parsing. */
function readWindows(response: Record<string, unknown>): TokenPlanWindow[] {
  const windows = new Map<string, TokenPlanWindow>();
  for (const [field, value] of Object.entries(response)) {
    const match = WINDOW_FIELD_PATTERN.exec(field);
    if (!match) continue;
    const numberValue = readNumber(value);
    if (numberValue === undefined) continue;

    const [, count, unit, kind] = match;
    const key = `per${count}${unit}`;
    const window = windows.get(key) ?? { key, count: Number(count), unit };
    if (kind === "Percentage") window.percentage = numberValue;
    else window.resetTime = numberValue;
    windows.set(key, window);
  }
  return [...windows.values()].sort(
    (left, right) => left.count * UNIT_HOURS[left.unit] - right.count * UNIT_HOURS[right.unit],
  );
}

function toJson(windows: TokenPlanWindow[]): TokenPlanUsage {
  const usage: TokenPlanUsage = {};
  for (const window of windows) {
    if (window.percentage !== undefined) usage[`${window.key}Percentage`] = window.percentage;
    if (window.resetTime !== undefined) usage[`${window.key}ResetTime`] = window.resetTime;
  }
  usage.hasQuotaData = windows.some((window) => window.percentage !== undefined);
  return usage;
}

function windowName(window: Pick<TokenPlanWindow, "count" | "unit">): string {
  if (window.count === 1 && window.unit === "Month") return "monthly";
  return `${window.count}-${window.unit.toLowerCase()}`;
}

function toSection(window: TokenPlanWindow): QuotaSection {
  const name = windowName(window);
  return {
    label: `${name.charAt(0).toUpperCase()}${name.slice(1)} quota`,
    emptyMessage: `The ${name} limit may be unlimited; verify in the Bailian Token Plan console.`,
    percentage: window.percentage,
    resetTime: window.resetTime,
  };
}

function printView(windows: TokenPlanWindow[], generatedAt: number): void {
  const visibleWindows =
    windows.length > 0 ? windows : [{ key: DEFAULT_WINDOW_KEY, count: 1, unit: "Month" }];
  printQuotaBox("Token Plan Usage", visibleWindows.map(toSection), generatedAt);
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
    const windows = readWindows(unwrapResponse(result as Record<string, unknown>));

    if (format === "json") {
      emitResult(toJson(windows), format);
      return;
    }

    printView(windows, Date.now());
  },
});
