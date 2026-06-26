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

import { isInteractive, type Config } from "bailian-cli-core";

/**
 * Build a command-usage string prefixed with the product binary name, e.g.
 * `bl --list-voices --model x`. Used for actionable hints inside error messages
 * (the error boundary renders full command help separately).
 */
export function cmdUsage(config: Config, args = ""): string {
  const bin = config.binName ?? "";
  return args ? `${bin} ${args}` : bin;
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
