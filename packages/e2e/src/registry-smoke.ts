/**
 * Derive command-group prefixes from product command-map keys.
 * Shared by cli / kscli registry smoke. Skip prefixes that are themselves
 * registered leaves (hybrid nodes such as `omni` + `omni translate`): registry
 * help at that path renders the leaf, not `Usage: … <command> [flags]`.
 */
export function deriveGroupPaths(commandPaths: string[]): string[] {
  const registeredLeaves = new Set(commandPaths);
  const groups = new Set<string>();
  for (const path of commandPaths) {
    const parts = path.split(" ");
    for (let partIndex = 1; partIndex < parts.length; partIndex++) {
      const prefix = parts.slice(0, partIndex).join(" ");
      if (registeredLeaves.has(prefix)) continue;
      const hasChildren = commandPaths.some(
        (candidate) => candidate.startsWith(`${prefix} `) && candidate !== prefix,
      );
      if (hasChildren) groups.add(prefix);
    }
  }
  return [...groups].sort();
}

interface RegistryHelpPrinter {
  printHelp(commandPath: string[], output: NodeJS.WriteStream): void;
}

export function captureRegistryHelp(printer: RegistryHelpPrinter, commandPath: string[]): string {
  let helpOutput = "";
  const output = {
    isTTY: false,
    write(chunk: string): boolean {
      helpOutput += chunk;
      return true;
    },
  } as NodeJS.WriteStream;

  printer.printHelp(commandPath, output);
  return helpOutput;
}
