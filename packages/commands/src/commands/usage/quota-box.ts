import {
  ansi,
  displayWidth,
  renderGauge,
  type GaugeCell,
  type TextStyle,
} from "bailian-cli-runtime";
import { formatDateTime } from "./shared.ts";

const BOX_WIDTH = 76;

/** One quota window rendered inside the box: a label + usage ratio + reset time. */
export interface QuotaSection {
  label: string;
  /** Shown instead of the gauge when the usage ratio is absent. */
  emptyMessage: string;
  /** Usage ratio in [0, 1]; absent means no data (possibly unlimited). */
  percentage?: number;
  resetTime?: number;
  /** Optional dim line under the gauge, e.g. "Used: 38 / 100". */
  detail?: string;
}

/** Accept only finite numbers; anything else counts as absent (possibly unlimited). */
export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Match the `usage free` gauge label style: 0.1% precision, no trailing zeros. */
function formatPercentage(ratio: number): string {
  const percent = Math.round(ratio * 1000) / 10;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
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

/** Print a bordered quota box with a title line and one gauge per section. */
export function printQuotaBox(title: string, sections: QuotaSection[], generatedAt: number): void {
  const color = ansi(process.stdout);
  const writeLine = (text = "", style?: TextStyle) => {
    const padding = Math.max(0, BOX_WIDTH - displayWidth(` ${text}`));
    process.stdout.write(`│ ${style ? style(text) : text}${" ".repeat(padding)}│\n`);
  };
  // Pre-colored gauge cell: pad from the plain variant so ANSI escapes never shift the border.
  const writeGaugeLine = (cell: GaugeCell) => {
    const padding = Math.max(0, BOX_WIDTH - displayWidth(` ${cell.plain}`));
    process.stdout.write(`│ ${cell.colored}${" ".repeat(padding)}│\n`);
  };
  const writeQuota = (section: QuotaSection) => {
    writeLine(section.label, color.bold);
    if (section.percentage === undefined) {
      writeLine(section.emptyMessage, color.dim);
      return;
    }

    const gaugeLabel = `${formatPercentage(section.percentage)} used`;
    writeGaugeLine(renderGauge(section.percentage * 100, gaugeLabel));
    if (section.detail) {
      writeLine(section.detail, color.dim);
    }
    if (section.resetTime === undefined) {
      writeLine("Resets: not applicable (no usage yet)", color.dim);
      return;
    }

    const resetText = `Resets: ${formatDateTime(section.resetTime)}  (in ${formatRemainingTime(section.resetTime, generatedAt)})`;
    writeLine(resetText, color.dim);
  };

  process.stdout.write(`┌${"─".repeat(BOX_WIDTH)}┐\n`);
  writeLine(title, color.cyan);
  writeLine(`Generated at: ${formatDateTime(generatedAt)} (local time)`, color.dim);
  for (const section of sections) {
    process.stdout.write(`├${"─".repeat(BOX_WIDTH)}┤\n`);
    writeQuota(section);
  }
  process.stdout.write(`└${"─".repeat(BOX_WIDTH)}┘\n`);
}
