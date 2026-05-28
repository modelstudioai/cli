/** Current command path (e.g. `["auth","login"]`) for help-on-missing; set by `main` before `execute`. */
let executingCommandPath: string[] = [];

let printCommandHelpImpl: ((commandPath: string[], out: NodeJS.WriteStream) => void) | null = null;

export function setExecutingCommandPath(path: string[]): void {
  executingCommandPath = path;
}

export function getExecutingCommandPath(): string[] {
  return executingCommandPath;
}

export function registerCommandHelpPrinter(
  fn: (commandPath: string[], out: NodeJS.WriteStream) => void,
): void {
  printCommandHelpImpl = fn;
}

/** Print help for the command currently being executed (must call `setExecutingCommandPath` first). */
export function printCurrentCommandHelp(out: NodeJS.WriteStream = process.stderr): void {
  if (printCommandHelpImpl && executingCommandPath.length > 0) {
    printCommandHelpImpl(executingCommandPath, out);
  }
}
