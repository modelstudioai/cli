import { createInterface } from "node:readline/promises";
import {
  BailianError,
  ExitCode,
  type CommandRisk,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";

/** Runtime-owned flag: commands declare risk, never their own confirmation flag. */
export const CONFIRMATION_FLAGS = {
  yes: {
    type: "switch",
    description: {
      "en-US": "Confirm this high-risk operation",
      "zh-CN": "确认执行此高风险操作",
    },
  },
} satisfies FlagsDef;

export function confirmationFlagDefs(command: { risk?: CommandRisk }): FlagsDef {
  return command.risk === undefined ? {} : CONFIRMATION_FLAGS;
}

/**
 * Transitional compatibility for commands that have not moved to command-level
 * risk metadata yet.
 * TODO(next commit): migrate every remaining caller to command-level risk metadata, then
 * remove this helper and update their confirmation wording/examples together.
 *
 * @deprecated Declare command-level risk metadata and let runtime gate confirmation.
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

export function confirmationHint(): LocalizedText {
  return {
    "en-US":
      "This command performs a high-risk operation. To continue, add --yes to the original command and re-run it.",
    "zh-CN": "此命令将执行高风险操作。如确认继续，请在原命令中添加 --yes 后重新执行。",
  };
}

interface ConfirmationRequiredErrorOptions {
  message: string;
  hint: string;
}

/** Semantic runtime error consumed by both humans and Agent callers. */
export class ConfirmationRequiredError extends BailianError {
  constructor(options: ConfirmationRequiredErrorOptions) {
    super(options.message, ExitCode.CONFIRMATION_REQUIRED, options.hint);
    this.name = "ConfirmationRequiredError";
  }

  override toJSON() {
    return {
      error: {
        code: this.exitCode,
        type: "requires_confirmation",
        message: this.message,
        hint: this.hint,
      },
    };
  }
}
