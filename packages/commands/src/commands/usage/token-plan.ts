import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import {
  ansi,
  displayWidth,
  emitResult,
  type AnsiStyles,
  type TextStyle,
} from "bailian-cli-runtime";
import { formatDateTime } from "./shared.ts";

const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";
const BOX_WIDTH = 76;
const PROGRESS_WIDTH = 32;

interface TokenPlanUsage {
  per5HourPercentage?: number;
  per5HourResetTime?: number;
  per1WeekPercentage?: number;
  per1WeekResetTime?: number;
}

interface QuotaWindow {
  percentage?: number;
  resetTime?: number;
}

/** Accept only finite numbers; anything else counts as absent (possibly unlimited). */
function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function formatPercentage(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatRemainingTime(resetTime: number, now: number): string {
  const remainingMs = Math.max(0, resetTime - now);
  const totalMinutes = Math.floor(remainingMs / 60_000);
  if (totalMinutes === 0) return "now";

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function progressBar(ratio: number): string {
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(clampedRatio * PROGRESS_WIDTH);
  return `[${"█".repeat(filled)}${"░".repeat(PROGRESS_WIDTH - filled)}]`;
}

function progressStyle(percentage: number, color: AnsiStyles): TextStyle {
  if (percentage >= 0.9) return color.red;
  if (percentage >= 0.75) return color.yellow;
  return color.green;
}

function printView(usage: TokenPlanUsage, generatedAt: number): void {
  const color = ansi(process.stdout);
  const writeLine = (text = "", style?: TextStyle) => {
    const padding = Math.max(0, BOX_WIDTH - displayWidth(` ${text}`));
    process.stdout.write(`│ ${style ? style(text) : text}${" ".repeat(padding)}│\n`);
  };
  const writeQuota = (label: string, unlimitedMessage: string, window: QuotaWindow) => {
    writeLine(label, color.bold);
    if (window.percentage === undefined) {
      writeLine(unlimitedMessage, color.dim);
      return;
    }

    const percentageText = formatPercentage(window.percentage);
    const bar = progressBar(window.percentage);
    writeLine(`${percentageText} used   ${bar}`, progressStyle(window.percentage, color));
    if (window.resetTime === undefined) {
      writeLine("Resets: not applicable (no usage yet)", color.dim);
      return;
    }

    const resetText = `Resets: ${formatDateTime(window.resetTime)}  (in ${formatRemainingTime(window.resetTime, generatedAt)})`;
    writeLine(resetText, color.dim);
  };

  process.stdout.write(`┌${"─".repeat(BOX_WIDTH)}┐\n`);
  writeLine("Token Plan Usage", color.cyan);
  writeLine(`Generated at: ${formatDateTime(generatedAt)} (local time)`, color.dim);
  process.stdout.write(`├${"─".repeat(BOX_WIDTH)}┤\n`);
  writeQuota(
    "5-hour quota",
    "The 5-hour limit may be unlimited; verify in the Bailian Token Plan console.",
    { percentage: usage.per5HourPercentage, resetTime: usage.per5HourResetTime },
  );
  process.stdout.write(`├${"─".repeat(BOX_WIDTH)}┤\n`);
  writeQuota(
    "1-week quota",
    "The 1-week limit may be unlimited; verify in the Bailian Token Plan console.",
    { percentage: usage.per1WeekPercentage, resetTime: usage.per1WeekResetTime },
  );
  process.stdout.write(`└${"─".repeat(BOX_WIDTH)}┘\n`);
}

export default defineCommand({
  description: "Show Token Plan quota usage",
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
