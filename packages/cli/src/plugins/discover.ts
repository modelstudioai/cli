import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import {
  getPluginsManifestPath,
  isBailianPluginPackage,
  isPluginPackageName,
  type BailianCliPackageMeta,
} from "bailian-cli-core";
import { getNodeModuleRoots } from "./paths.ts";
import type { DiscoveredPlugin, UserPluginRecord, UserPluginsManifest } from "./types.ts";

const PACKAGE_JSON = "package.json";

/** node_modules 扫描时并行读取 package.json 的上限 */
const DISCOVER_CONCURRENCY = 32;

interface PackageJson {
  name?: string;
  version?: string;
  bailianCli?: BailianCliPackageMeta;
}

async function readPackageJson(root: string): Promise<PackageJson | undefined> {
  const p = join(root, PACKAGE_JSON);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(await readFile(p, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

function toDiscovered(
  root: string,
  pjson: PackageJson,
  source: DiscoveredPlugin["source"],
): DiscoveredPlugin | undefined {
  const name = pjson.name;
  if (!name || !pjson.bailianCli) return undefined;
  if (!isBailianPluginPackage(name, pjson.bailianCli)) return undefined;
  if (!pjson.bailianCli.commands) return undefined;
  return {
    name,
    root,
    version: pjson.version,
    source,
    bailianCli: pjson.bailianCli,
  };
}

function isPackageEntry(entry: {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}): boolean {
  return entry.isDirectory() || entry.isSymbolicLink();
}

/** 有限并发执行异步任务 */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = Array.from({ length: items.length });
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function listPackagesInNodeModules(nodeModulesRoot: string): Promise<string[]> {
  if (!existsSync(nodeModulesRoot)) return [];
  const names: string[] = [];
  const entries = await readdir(nodeModulesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = join(nodeModulesRoot, entry.name);
      let scoped;
      try {
        scoped = await readdir(scopeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const pkg of scoped) {
        if (isPackageEntry(pkg)) names.push(`${entry.name}/${String(pkg.name)}`);
      }
    } else if (isPackageEntry(entry)) {
      names.push(entry.name);
    }
  }
  return names;
}

async function tryDiscoverFromNodeModulesPackage(
  nmRoot: string,
  pkgName: string,
): Promise<DiscoveredPlugin | undefined> {
  const root = join(nmRoot, pkgName);
  const pjson = await readPackageJson(root);
  if (!pjson) return undefined;
  return toDiscovered(root, pjson, "discovered");
}

async function discoverFromNodeModules(): Promise<DiscoveredPlugin[]> {
  if (process.env.BAILIAN_CLI_PLUGINS_SKIP_NODE_MODULES === "1") {
    return [];
  }
  const found = new Map<string, DiscoveredPlugin>();
  for (const nmRoot of getNodeModuleRoots()) {
    const packageNames = await listPackagesInNodeModules(nmRoot);
    const candidates = packageNames.filter(
      (pkgName) => !found.has(pkgName) && isPluginPackageName(pkgName),
    );
    const discovered = await mapPool(candidates, DISCOVER_CONCURRENCY, (pkgName) =>
      tryDiscoverFromNodeModulesPackage(nmRoot, pkgName),
    );
    for (let i = 0; i < candidates.length; i++) {
      const plugin = discovered[i];
      if (plugin) found.set(candidates[i]!, plugin);
    }
  }
  return [...found.values()];
}

async function readUserManifest(): Promise<UserPluginsManifest | undefined> {
  const path = getPluginsManifestPath();
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as UserPluginsManifest;
  } catch {
    return undefined;
  }
}

async function resolveUserPlugin(record: UserPluginRecord): Promise<DiscoveredPlugin | undefined> {
  if (record.type === "link" && record.root) {
    const pjson = await readPackageJson(record.root);
    if (!pjson) return undefined;
    const plugin = toDiscovered(record.root, pjson, "link");
    if (plugin) plugin.name = record.name;
    return plugin;
  }

  for (const nmRoot of getNodeModuleRoots()) {
    const root = join(nmRoot, record.name);
    if (!existsSync(join(root, PACKAGE_JSON))) continue;
    const pjson = await readPackageJson(root);
    if (!pjson) continue;
    const plugin = toDiscovered(root, pjson, "user");
    if (plugin) return plugin;
  }
  return undefined;
}

async function discoverFromUserManifest(): Promise<DiscoveredPlugin[]> {
  const manifest = await readUserManifest();
  const records = manifest?.bailianCli?.plugins ?? [];
  const results = await Promise.allSettled(records.map((record) => resolveUserPlugin(record)));
  const plugins: DiscoveredPlugin[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      plugins.push(result.value);
    }
  }
  return plugins;
}

export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
  const byName = new Map<string, DiscoveredPlugin>();

  for (const plugin of await discoverFromNodeModules()) {
    byName.set(plugin.name, plugin);
  }

  for (const plugin of await discoverFromUserManifest()) {
    byName.set(plugin.name, plugin);
  }

  return [...byName.values()];
}

export { readUserManifest, readPackageJson };
