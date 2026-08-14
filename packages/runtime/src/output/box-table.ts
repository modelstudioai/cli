/**
 * Bordered table renderer with a highlighted header bar and an optional
 * gauge (bar-chart) column. Used by the `bl usage` family (Free Tier table);
 * other commands continue to use `formatTable` from `./table.ts`.
 *
 * Only affects human-readable output. Width calculations run on plain text
 * (CJK-aware) so ANSI color escapes never inflate column widths. Colors
 * degrade to plain characters when the stream is not a TTY or NO_COLOR is set.
 */
import { isTerminal } from "./color.ts";
import { displayWidth, padEnd } from "./cjk-width.ts";

const SEPARATOR = " │ ";
const FILLED_CELL = "█";
/** Gauge width in cells; the filled/track boundary marks the percentage. */
const DEFAULT_BAR_WIDTH = 20;
/** Brand cyan for the usage-table chrome: header bar, column separators, and bar fill. */
const CHROME_RGB = [0, 150, 160] as const;
/** Light blue for the percent label next to the gauge. */
const LABEL_RGB = [176, 205, 250] as const;
/** Neutral gray for the percent label when there is no numeric value. */
const NEUTRAL_LABEL_RGB = [160, 160, 170] as const;

type Rgb = readonly [number, number, number];
/** Terminal color depth: 0=none, 1=16-color, 2=256-color, 3=truecolor. */
type ColorLevel = 0 | 1 | 2 | 3;

/**
 * Detect the terminal's color depth.
 *
 * Emitting 24-bit truecolor to a 256-color terminal makes the terminal
 * mis-parse the escape into garbage (often stripped or rendered as white).
 * So we must downsample truecolor to `38;5;n` (256) when truecolor isn't
 * advertised. Local to this module so it doesn't leak to other commands.
 */
function colorLevel(out: NodeJS.WriteStream): ColorLevel {
  if ("NO_COLOR" in process.env) return 0;
  const force = process.env.FORCE_COLOR;
  if (force != null) {
    if (force === "0" || force === "false") return 0;
    if (force === "3" || force === "truecolor") return 3;
    if (force === "2") return 2;
    if (force === "1" || force === "true" || force === "") return 1;
  }
  if (!isTerminal(out)) return 0;
  const colorterm = process.env.COLORTERM;
  if (colorterm === "truecolor" || colorterm === "24bit") return 3;
  const term = process.env.TERM ?? "";
  if (term === "dumb") return 1;
  if (/-256(color)?$/i.test(term)) return 2;
  return 1;
}

/** Map an RGB triple to the nearest xterm-256 palette index. */
function rgbToAnsi256(red: number, green: number, blue: number): number {
  if (red === green && green === blue) {
    if (red < 8) return 16;
    if (red > 248) return 231;
    return 232 + Math.round(((red - 8) / 247) * 24);
  }
  return (
    16 +
    36 * Math.round((red / 255) * 5) +
    6 * Math.round((green / 255) * 5) +
    Math.round((blue / 255) * 5)
  );
}

/** Map an RGB triple to a basic 16-color SGR number for the given layer. */
function rgbToAnsi16(red: number, green: number, blue: number, layer: 38 | 48): number {
  const bright = Math.max(red, green, blue) > 127;
  const threshold = bright ? 128 : 64;
  const bits =
    (red >= threshold ? 1 : 0) | (green >= threshold ? 2 : 0) | (blue >= threshold ? 4 : 0);
  const base = layer === 48 ? (bright ? 100 : 40) : bright ? 90 : 30;
  return base + bits;
}

/** Build an SGR color parameter for the given depth. */
function rgbToSgr(
  level: ColorLevel,
  red: number,
  green: number,
  blue: number,
  layer: 38 | 48 = 38,
): string {
  if (level >= 3) return `${layer};2;${red};${green};${blue}`;
  if (level === 2) return `${layer};5;${rgbToAnsi256(red, green, blue)}`;
  return String(rgbToAnsi16(red, green, blue, layer));
}

function fg(level: ColorLevel, [red, green, blue]: Rgb, text: string): string {
  if (level <= 0) return text;
  return `\x1b[${rgbToSgr(level, red, green, blue)}m${text}\x1b[0m`;
}

/** Render the header as a solid single-color bar with bold white text. */
function solidHeaderBar(plain: string, level: ColorLevel, chrome: Rgb): string {
  if (level <= 0) return plain;
  const fgCode = rgbToSgr(level, 255, 255, 255, 38);
  const bgCode = rgbToSgr(level, chrome[0], chrome[1], chrome[2], 48);
  return `\x1b[1;${fgCode};${bgCode}m${plain}\x1b[0m`;
}

export interface BarColumn {
  /** Zero-based index of the column rendered as a gauge. */
  index: number;
  /** Percent (0-100) per row, aligned with `rows`; null renders an empty gauge. */
  percents: (number | null)[];
  /** Optional text shown after each gauge (e.g. "84%", "expired"); overrides the default percent label. */
  labels?: (string | null)[];
  /** Gauge width in cells (default 20). */
  width?: number;
}

export interface BoxTableOptions {
  headers: string[];
  rows: string[][];
  /** Per-column alignment; defaults to left. */
  align?: ("left" | "right")[];
  /** One or more gauge columns rendered as progress bars. */
  barColumns?: BarColumn[];
  /** Return a colored variant of a plain cell value (must keep the same visible width). */
  cellColor?: (rowIndex: number, colIndex: number, value: string) => string | undefined;
  /** Stream used for color capability detection (default process.stdout). */
  out?: NodeJS.WriteStream;
}

function padStartWidth(text: string, targetWidth: number): string {
  const gap = targetWidth - displayWidth(text);
  return gap > 0 ? " ".repeat(gap) + text : text;
}

interface RenderedCell {
  plain: string;
  colored: string;
}

/** A standalone gauge cell (bar + label) for non-table layouts, e.g. the usage quota box. */
export interface GaugeCell {
  plain: string;
  colored: string;
}

/**
 * Render a single gauge cell in the `usage free` table style: brand-cyan fill,
 * transparent track, and a light-blue label after the bar. `percent` is 0-100;
 * null renders an empty gauge with a neutral label.
 */
export function renderGauge(
  percent: number | null,
  label: string,
  width: number = DEFAULT_BAR_WIDTH,
  out: NodeJS.WriteStream = process.stdout,
): GaugeCell {
  return buildBarCell(percent, label, width, colorLevel(out));
}

function buildBarCell(
  percent: number | null,
  label: string,
  barWidth: number,
  level: ColorLevel,
): RenderedCell {
  const clamped = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const hasValue = percent != null;
  const filled = hasValue ? Math.round((clamped / 100) * barWidth) : 0;

  let plain = "";
  let colored = "";

  for (let index = 0; index < barWidth; index++) {
    // Remaining quota is cyan; the used portion is left blank (transparent).
    if (hasValue && index < filled) {
      plain += FILLED_CELL;
      colored += fg(level, CHROME_RGB, FILLED_CELL);
    } else {
      plain += " ";
      colored += " ";
    }
  }

  const labelColor = hasValue ? LABEL_RGB : NEUTRAL_LABEL_RGB;
  plain += `  ${label}`;
  colored += `  ${fg(level, labelColor, label)}`;
  return { plain, colored };
}

/**
 * Render a bordered table as an array of lines. The header row is drawn as a
 * solid highlight bar that extends to the full table width.
 */
export function renderBoxTable(options: BoxTableOptions): string[] {
  const out = options.out ?? process.stdout;
  const level = colorLevel(out);
  const align = options.align ?? [];

  const barColumns = options.barColumns ?? [];

  const columnCount = options.headers.length;

  // Precompute bar cells for all gauge columns
  type BarCellsMap = Record<number, RenderedCell[]>;
  const allBarCells: BarCellsMap = {};

  for (const barCol of barColumns) {
    const barWidth = barCol.width ?? DEFAULT_BAR_WIDTH;
    const barCells: RenderedCell[] = [];
    for (let rowIndex = 0; rowIndex < options.rows.length; rowIndex++) {
      const percent = barCol.percents[rowIndex] ?? null;
      const explicitLabel = barCol.labels?.[rowIndex];
      const label =
        explicitLabel != null
          ? explicitLabel
          : percent == null
            ? "-"
            : `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
      barCells.push(buildBarCell(percent, label, barWidth, level));
    }
    allBarCells[barCol.index] = barCells;
  }

  const plainCell = (rowIndex: number, colIndex: number): string => {
    if (allBarCells[colIndex]) return allBarCells[colIndex][rowIndex].plain;
    return options.rows[rowIndex][colIndex] ?? "";
  };

  const widths = options.headers.map((header, colIndex) => {
    let max = displayWidth(header);
    for (let rowIndex = 0; rowIndex < options.rows.length; rowIndex++) {
      const width = displayWidth(plainCell(rowIndex, colIndex));
      if (width > max) max = width;
    }
    return max;
  });

  const lines: string[] = [];

  const headerPlain = options.headers
    .map((header, colIndex) =>
      align[colIndex] === "right"
        ? padStartWidth(header, widths[colIndex])
        : padEnd(header, widths[colIndex]),
    )
    .join(SEPARATOR);
  const tableWidth = Math.max(
    displayWidth(headerPlain),
    ...options.rows.map((_, rowIndex) =>
      displayWidth(
        Array.from({ length: columnCount }, (_unused, colIndex) =>
          plainCell(rowIndex, colIndex),
        ).join(SEPARATOR),
      ),
    ),
  );
  lines.push(solidHeaderBar(` ${padEnd(headerPlain, tableWidth)} `, level, CHROME_RGB));

  // Column separators use the same brand cyan as the header.
  const separator = ` ${fg(level, CHROME_RGB, "│")} `;

  for (let rowIndex = 0; rowIndex < options.rows.length; rowIndex++) {
    const cells: string[] = [];
    for (let colIndex = 0; colIndex < columnCount; colIndex++) {
      const width = widths[colIndex];
      // Check if this column is a gauge column
      if (allBarCells[colIndex]) {
        const bar = allBarCells[colIndex][rowIndex];
        const gap = width - displayWidth(bar.plain);
        cells.push(gap > 0 ? bar.colored + " ".repeat(gap) : bar.colored);
        continue;
      }
      const value = options.rows[rowIndex][colIndex] ?? "";
      const styled = options.cellColor?.(rowIndex, colIndex, value);
      const padded =
        align[colIndex] === "right" ? padStartWidth(value, width) : padEnd(value, width);
      if (styled) {
        // Re-apply padding around the styled value to preserve column width.
        cells.push(
          align[colIndex] === "right"
            ? padded.slice(0, padded.length - value.length) + styled
            : styled + padded.slice(value.length),
        );
      } else {
        cells.push(padded);
      }
    }
    let row = " ";
    for (let colIndex = 0; colIndex < columnCount; colIndex++) {
      row += cells[colIndex];
      if (colIndex < columnCount - 1) row += separator;
    }
    lines.push(row);
  }

  return lines;
}
