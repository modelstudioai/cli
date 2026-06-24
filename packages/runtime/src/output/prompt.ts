/**
 * Interactive prompt utilities.
 *
 * Wraps @clack/prompts with environment-awareness:
 * - In interactive mode: shows prompts and lets users input values.
 * - In non-interactive / CI / Agent mode: fails fast with a clear error.
 *
 * All functions here are no-ops (return undefined) when non-interactive,
 * so callers must check isInteractive() first or handle the missing-value
 * case explicitly.
 */

import { BailianError, ExitCode, isInteractive, type Config } from "bailian-cli-core";
import { printCurrentCommandHelp, getExecutingCommandPath } from "../utils/command-help.ts";

/**
 * Build a command-usage string for the running command: `<binName> <path> <args>`.
 * Both the product binary name and the command path come from the runtime, so
 * callers never hardcode "bl" or their own path — the same code renders as
 * `bl knowledge retrieve …` under bl and `rag retrieve …` under rag.
 */
export function cmdUsage(config: Config, args = ""): string {
  const parts = [config.binName, ...getExecutingCommandPath()].filter(Boolean);
  return args ? `${parts.join(" ")} ${args}` : parts.join(" ");
}

// Dynamic import to avoid loading @clack/prompts in non-interactive envs unnecessarily
// (though for CLI tools the startup cost is usually acceptable)

/**
 * Prompt the user for a text value.
 * Only call this when isInteractive() is true; otherwise the function returns
 * undefined immediately so the caller can fail fast.
 */
export async function promptText(options: {
  message: string;
  defaultValue?: string;
}): Promise<string | undefined> {
  if (!isInteractive()) return undefined;

  const { defaultValue, message } = options;
  const inquirer = (await import("@clack/prompts")) as {
    text: (opts: {
      message: string;
      default?: string;
      placeholder?: string;
    }) => Promise<string | symbol>;
  };
  const val = await inquirer.text({
    message,
    default: defaultValue,
    placeholder: defaultValue,
  });

  // @clack/prompts returns a Symbol.cancel when the user presses Ctrl+C
  if (typeof val === "symbol") return undefined;
  return val as string;
}

/**
 * Like promptText but confirms with y/N before proceeding.
 */
export async function promptConfirm(options: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean | undefined> {
  if (!isInteractive()) return undefined;

  const { message, initialValue } = options;
  const inquirer = (await import("@clack/prompts")) as {
    confirm: (opts: { message: string; initialValue?: boolean }) => Promise<boolean | symbol>;
  };
  const val = await inquirer.confirm({ message, initialValue });

  if (typeof val === "symbol") return undefined;
  return val as boolean;
}

/**
 * Prompt the user to select one value from a list.
 * Only call this when isInteractive() is true; otherwise the function returns
 * undefined immediately so the caller can fail fast.
 */
export async function promptSelect(options: {
  message: string;
  choices: Array<{ value: string; label: string; hint?: string }>;
  defaultValue?: string;
}): Promise<string | undefined> {
  if (!isInteractive()) return undefined;

  const { message, choices, defaultValue } = options;
  const clack = (await import("@clack/prompts")) as {
    select: (opts: {
      message: string;
      initialValue?: string;
      options: Array<{ value: string; label: string; hint?: string }>;
    }) => Promise<string | symbol>;
  };
  const val = await clack.select({
    message,
    initialValue: defaultValue,
    options: choices,
  });

  if (typeof val === "symbol") return undefined;
  return val as string;
}

/**
 * Fail fast with a user-friendly error when a required option is missing
 * in non-interactive (agent / CI) mode.
 */
export function failIfMissing(flagName: string, context: string): never {
  if (getExecutingCommandPath().length > 0) {
    printCurrentCommandHelp(process.stderr);
    process.exit(0);
  }
  throw new BailianError(
    `Missing required argument: --${flagName}\n` +
      `Hint: In non-interactive (CI / agent) environments all required flags must be provided.\n` +
      `      In an interactive terminal, run without --${flagName} and the CLI will prompt for it.`,
    ExitCode.USAGE,
    context,
  );
}
