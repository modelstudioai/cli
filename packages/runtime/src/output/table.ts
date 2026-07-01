/**
 * Tabular text formatting helper.
 *
 * Given a header row and data rows, calculates per-column widths and
 * outputs space-padded columns so the table is human-readable.
 */

/** Produce aligned text lines from headers + rows (all string[]). */
export function formatTable(
  headers: string[],
  rows: string[][],
  { gap = 2 }: { gap?: number } = {},
): string[] {
  // Calculate max width for each column (header vs data).
  const widths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = row[i] ?? "";
      if (cell.length > max) max = cell.length;
    }
    return max;
  });

  const pad = " ".repeat(gap);
  const formatRow = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i]!)).join(pad);

  const lines: string[] = [];
  lines.push(formatRow(headers));
  for (const row of rows) {
    lines.push(formatRow(row));
  }
  return lines;
}
