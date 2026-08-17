// Confirmation guard for dangerous operations — used by irreversible or
// production-affecting commands (kb/doc/chunk/category/file delete, service
// delete/deploy, ...).
import { createInterface } from "node:readline/promises";
import { BailianError, ExitCode } from "bailian-cli-core";

/**
 * - `yes` (the command's own --yes switch) → pass through
 * - TTY: print the summary and wait for y/yes (case-insensitive); any other
 *   input cancels with exit SUCCESS (cancellation is not an error)
 * - non-TTY without --yes: throw USAGE
 */
export async function confirmDangerousAction(summary: string, yes: boolean): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new BailianError(
      "Confirmation required for this destructive action.",
      ExitCode.USAGE,
      "Re-run with --yes to confirm in non-interactive mode",
    );
  }
  process.stderr.write(`${summary}\n`);
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await readline.question("Proceed? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      process.stderr.write("Cancelled.\n");
      // Intentional: a user-initiated cancellation is not an error, and we want
      // to exit here rather than unwind through the middleware stack (which
      // would still print a success report for an action that did not happen).
      process.exit(ExitCode.SUCCESS);
    }
  } finally {
    readline.close();
  }
}
