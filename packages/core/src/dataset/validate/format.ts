import type { ValidationIssue } from "./types.ts";

/**
 * Format a single validation issue as a one-line string.
 *
 * Shared across every entry point that surfaces dataset validation results
 * (`dataset validate`, `dataset upload`, `finetune create`) so the error
 * presentation stays consistent regardless of which command ran the validator.
 */
export function formatIssue(issue: ValidationIssue): string {
  const where: string[] = [];
  if (issue.line !== undefined) where.push(`line ${issue.line}`);
  if (issue.path) where.push(issue.path);
  const tag = where.length ? ` [${where.join(" · ")}]` : "";
  return `  ${issue.severity.toUpperCase()} ${issue.code}${tag}: ${issue.message}`;
}
