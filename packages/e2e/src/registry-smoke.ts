/**
 * 从产品 commands map 的 path key 推导有子命令的分组前缀。
 * 供 cli / kscli registry smoke 共用。
 */
export function deriveGroupPaths(commandPaths: string[]): string[] {
  const groups = new Set<string>();
  for (const path of commandPaths) {
    const parts = path.split(" ");
    for (let partIndex = 1; partIndex < parts.length; partIndex++) {
      const prefix = parts.slice(0, partIndex).join(" ");
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
