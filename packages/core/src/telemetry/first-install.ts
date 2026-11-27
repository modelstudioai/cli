import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config/paths.ts";

/** Separate from install.json so a report attempt cannot rewrite the install day. */
export const FIRST_INSTALL_REPORT_FILE = "first-install-reported.json";

/** One queued report per install day. A later command does not send it again. */
export const FIRST_INSTALL_REPORT_ATTEMPTS = 1;

/**
 * Installers pass this with BAILIAN_FIRST_INSTALL_REPORT=1.
 * The variable alone must not turn a later user command into a silent report.
 */
export const FIRST_INSTALL_REPORT_ARGUMENT = "--bailian-first-install-report";

export function isFirstInstallReportLaunch(argv: readonly string[]): boolean {
  return (
    process.env.BAILIAN_FIRST_INSTALL_REPORT === "1" &&
    argv.length === 1 &&
    argv[0] === FIRST_INSTALL_REPORT_ARGUMENT
  );
}

interface FirstInstallReport {
  attempts: number;
  firstInstalledAt: string;
}

function isReport(value: unknown): value is FirstInstallReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.firstInstalledAt === "string" &&
    typeof report.attempts === "number" &&
    Number.isInteger(report.attempts) &&
    report.attempts >= 0
  );
}

/** How many times this install day was queued. A missing or different record counts as zero. */
export function readFirstInstallReportAttempts(firstInstalledAt: string): number {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(getConfigDir(), FIRST_INSTALL_REPORT_FILE), "utf8"),
    );
    if (!isReport(parsed) || parsed.firstInstalledAt !== firstInstalledAt) return 0;
    return parsed.attempts;
  } catch {
    return 0;
  }
}

/** Record one queued attempt. Failures throw so the caller can skip the increment. */
export function noteFirstInstallReportQueued(firstInstalledAt: string): void {
  const attempts = readFirstInstallReportAttempts(firstInstalledAt) + 1;
  writeFileSync(
    join(getConfigDir(), FIRST_INSTALL_REPORT_FILE),
    `${JSON.stringify({ attempts, firstInstalledAt })}\n`,
    { mode: 0o600 },
  );
}
