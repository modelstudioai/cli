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
