import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getPluginsDir } from "bailian-cli-core";

/**
 * Resolve the CLI package root.
 * @returns The CLI package root.
 */
export function resolveCliPackageRoot(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  // plugins/paths.ts -> src/plugins -> src -> packages/cli
  const cliRoot = join(dir, "..", "..");
  if (existsSync(join(cliRoot, "package.json"))) return cliRoot;
  return join(dir, "..", "..", "..");
}

/**
 * Get all node_modules roots for plugin discovery.
 * @returns An array of node_modules roots.
 */
export function getNodeModuleRoots(): string[] {
  const roots = new Set<string>();
  const cwdModules = join(process.cwd(), "node_modules");
  if (existsSync(cwdModules)) roots.add(cwdModules);

  const cliModules = join(resolveCliPackageRoot(), "node_modules");
  if (existsSync(cliModules)) roots.add(cliModules);

  const userModules = join(getPluginsDir(), "node_modules");
  if (existsSync(userModules)) roots.add(userModules);

  return [...roots];
}
