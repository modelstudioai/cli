import { BailianError, ExitCode, defineCommand, unwrapResponse } from "bailian-cli-core";
import { ansi, displayWidth, emitResult, type TextStyle } from "bailian-cli-runtime";

const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage";
const BOX_WIDTH = 76;
const PROGRESS_WIDTH = 32;

interface TokenPlanUsage {
  per5HourPercentage?: number;
  per5HourResetTime?: number;
  per1WeekPercentage?: number;
  per1WeekResetTime?: number;
}

function readUsage(result: unknown): TokenPlanUsage {
  const response = unwrapResponse(result as Record<string, unknown>);
  const usage = {
    per5HourPercentage: response.per5HourPercentage,
    per5HourResetTime: response.per5HourResetTime,
    per1WeekPercentage: response.per1WeekPercentage,
    per1WeekResetTime: response.per1WeekResetTime,
  };

  const quotas = [
    [usage.per5HourPercentage, usage.per5HourResetTime],
    [usage.per1WeekPercentage, usage.per1WeekResetTime],
  ];
  const hasValidQuotas = quotas.every(
    ([percentage, resetTime]) =>
      (percentage === undefined && resetTime === undefined) ||
      (typeof percentage === "number" &&
        Number.isFinite(percentage) &&
        ((percentage === 0 && resetTime === undefined) ||
          (typeof resetTime === "number" && Number.isFinite(resetTime)))),
  );

  if (!hasValidQuotas) {
    throw new BailianError("Token Plan usage response has an unexpected format.", ExitCode.GENERAL);
  }

  return usage as TokenPlanUsage;
}

function formatPercentage(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
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

function progressStyle(
  percentage: number,
  green: TextStyle,
  yellow: TextStyle,
  red: TextStyle,
): TextStyle {
  if (percentage >= 0.9) return red;
  if (percentage >= 0.75) return yellow;
  return green;
}

function printView(usage: TokenPlanUsage, generatedAt: number): void {
  const color = ansi(process.stdout);
  const writeLine = (content = "", visibleContent = content) => {
    const padding = Math.max(0, BOX_WIDTH - displayWidth(` ${visibleContent}`));
    process.stdout.write(`│ ${content}${" ".repeat(padding)}│\n`);
  };
  const writeQuota = (
    label: string,
    unlimitedMessage: string,
    percentage: number | undefined,
    resetTime: number | undefined,
  ) => {
    writeLine(color.bold(label), label);
    if (percentage === undefined) {
      writeLine(color.dim(unlimitedMessage), unlimitedMessage);
      return;
    }

    const percentageText = formatPercentage(percentage);
    const bar = progressBar(percentage);
    const style = progressStyle(percentage, color.green, color.yellow, color.red);
    writeLine(`${percentageText} used   ${style(bar)}`, `${percentageText} used   ${bar}`);
    if (resetTime === undefined) {
      writeLine(
        color.dim("Resets: not applicable (no usage yet)"),
        "Resets: not applicable (no usage yet)",
      );
      return;
    }

    const resetText = `Resets: ${formatDateTime(resetTime)}  (in ${formatRemainingTime(resetTime, generatedAt)})`;
    writeLine(color.dim(resetText), resetText);
  };

  process.stdout.write(`┌${"─".repeat(BOX_WIDTH)}┐\n`);
  writeLine(color.cyan("Token Plan Usage"), "Token Plan Usage");
  const generatedAtText = `Generated at: ${formatDateTime(generatedAt)} (local time)`;
  writeLine(color.dim(generatedAtText), generatedAtText);
  process.stdout.write(`├${"─".repeat(BOX_WIDTH)}┤\n`);
  writeQuota(
    "5-hour quota",
    "5小时限额当前可能无限制，请到百炼 Token Plan 控制台核实。",
    usage.per5HourPercentage,
    usage.per5HourResetTime,
  );
  process.stdout.write(`├${"─".repeat(BOX_WIDTH)}┤\n`);
  writeQuota(
    "1-week quota",
    "1周限额当前可能无限制，请到百炼 Token Plan 控制台核实。",
    usage.per1WeekPercentage,
    usage.per1WeekResetTime,
  );
  process.stdout.write(`└${"─".repeat(BOX_WIDTH)}┘\n`);
}

export default defineCommand({
  description: "Show Token Plan quota usage as core JSON or a human-readable view",
  auth: "console",
  usageArgs: "<--json | --view> [flags]",
  flags: {
    json: {
      type: "switch",
      description: "Output only the four core usage fields as JSON",
    },
    view: {
      type: "switch",
      description: "Render a compact human-readable quota view",
    },
  },
  exampleArgs: ["--json", "--view"],
  validate: (flags) =>
    flags.json === flags.view ? "Choose exactly one of --json or --view." : undefined,
  async run(ctx) {
    const { flags, settings } = ctx;

    if (settings.dryRun) {
      emitResult({ api: TOKEN_PLAN_USAGE_API, data: {} }, "json");
      return;
    }

    const result = await ctx.client.console(TOKEN_PLAN_USAGE_API, {});
    const usage = readUsage(result);

    if (flags.json) {
      emitResult(usage, "json");
      return;
    }

    printView(usage, Date.now());
  },
});
