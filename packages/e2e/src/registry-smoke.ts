/**
 * 从产品 commands map 的 path key 推导有子命令的分组前缀。
 * 供 cli / kscli registry smoke 共用。
 */
export function deriveGroupPaths(commandPaths: string[]): string[] {
  const groups = new Set<string>();
  for (const path of commandPaths) {
    const parts = path.split(" ");
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join(" ");
      const hasChildren = commandPaths.some(
        (candidate) => candidate.startsWith(`${prefix} `) && candidate !== prefix,
      );
      if (hasChildren) groups.add(prefix);
    }
  }
  return [...groups].sort();
}
