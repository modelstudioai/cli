import { ansi } from "./color.ts";
import { displayWidth } from "./cjk-width.ts";

/**
 * Frame a multi-line notice. Yellow border on TTY; plain box otherwise.
 * Width uses display columns (CJK counts as two).
 */
export function renderNoticeBox(
  title: string,
  lines: readonly string[],
  out: NodeJS.WriteStream = process.stderr,
): string {
  const color = ansi(out);
  const padding = 1;
  const titleLabel = ` ${title} `;
  const contentWidth = Math.max(
    displayWidth(titleLabel),
    ...lines.map((line) => displayWidth(line)),
    16,
  );
  const innerWidth = contentWidth + padding * 2;
  const top = `┌${titleLabel}${"─".repeat(Math.max(innerWidth - displayWidth(titleLabel), 0))}┐`;
  const bottom = `└${"─".repeat(innerWidth)}┘`;
  const body = lines.map((line) => {
    const gap = contentWidth - displayWidth(line);
    return `│${" ".repeat(padding)}${line}${" ".repeat(Math.max(gap, 0))}${" ".repeat(padding)}│`;
  });
  return [top, ...body, bottom].map((line) => color.yellow(line)).join("\n");
}
