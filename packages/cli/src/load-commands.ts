import { commands as builtinCommands } from "./commands/catalog.ts";
import {
  computeFingerprint,
  fingerprintMatches,
  isPluginCommandsCacheDisabled,
  pruneCache,
  readCommandsCache,
  writeCommandsCache,
  type CachedPluginEntry,
  type CommandsCache,
  COMMANDS_CACHE_SCHEMA,
} from "./plugins/cache.ts";
import { discoverPlugins } from "./plugins/discover.ts";
import { mergeCommands, type PluginCommandEntry } from "./plugins/priority.ts";
import { extractCommandMeta, lazyCommandFromMeta, scanPluginCommands } from "./plugins/scan.ts";
import type { CommandCatalog, DiscoveredPlugin, PluginLoadError } from "./plugins/types.ts";
import { CLI_VERSION } from "./version.ts";

let cachedCatalog: CommandCatalog | undefined;

function collectNoAuthSetup(plugin: DiscoveredPlugin): string[] {
  return (plugin.bailianCli.noAuthSetup ?? []).map((p) => p.trim()).filter(Boolean);
}

function expandNoAuthSetup(paths: string[]): string[][] {
  return paths.map((p) => p.split(/\s+/).filter(Boolean));
}

/** 带盘缓存的插件命令加载 */
async function loadPluginCommandsWithCache(plugins: DiscoveredPlugin[]): Promise<{
  entries: PluginCommandEntry[];
  pluginErrors: PluginLoadError[];
  noAuthSetup: string[][];
}> {
  const pluginErrors: PluginLoadError[] = [];
  const noAuthSetup: string[][] = [];
  const entries: PluginCommandEntry[] = [];

  const useCache = !isPluginCommandsCacheDisabled();
  const diskCache = useCache ? await readCommandsCache() : undefined;
  const cacheValid = diskCache?.cliVersion === CLI_VERSION;
  let needsWrite = useCache && !cacheValid;

  const nextPlugins: Record<string, CachedPluginEntry> = {};

  for (const plugin of plugins) {
    const fingerprint = computeFingerprint(plugin);
    const cached = useCache && cacheValid ? diskCache!.plugins[plugin.name] : undefined;

    if (cached && fingerprintMatches(cached.fingerprint, fingerprint)) {
      for (const paths of expandNoAuthSetup(cached.noAuthSetup)) {
        noAuthSetup.push(paths);
      }
      for (const meta of cached.commands) {
        entries.push({
          path: meta.commandPath,
          command: lazyCommandFromMeta(meta),
          plugin,
        });
      }
      nextPlugins[plugin.name] = cached;
      continue;
    }

    if (useCache) needsWrite = true;

    const { commands: scanned, error } = await scanPluginCommands(plugin);
    if (error) pluginErrors.push(error);

    const noAuthPaths = collectNoAuthSetup(plugin);
    for (const paths of expandNoAuthSetup(noAuthPaths)) {
      noAuthSetup.push(paths);
    }

    const metas = [];
    for (const item of scanned) {
      const meta = await extractCommandMeta(item);
      if (!meta) {
        pluginErrors.push({
          plugin: plugin.name,
          message: `Could not load command module: ${item.commandPath}`,
        });
        continue;
      }
      metas.push(meta);
      entries.push({
        path: meta.commandPath,
        command: lazyCommandFromMeta(meta),
        plugin,
      });
    }

    if (useCache) {
      nextPlugins[plugin.name] = {
        fingerprint,
        commands: metas,
        noAuthSetup: noAuthPaths,
      };
    }
  }

  if (needsWrite && useCache) {
    const cache: CommandsCache = {
      schema: COMMANDS_CACHE_SCHEMA,
      cliVersion: CLI_VERSION,
      plugins: pruneCache(
        nextPlugins,
        plugins.map((p) => p.name),
      ),
    };
    await writeCommandsCache(cache);
  }

  return { entries, pluginErrors, noAuthSetup };
}

/**
 * Load the command catalog.
 * @returns The command catalog.
 */
export async function loadCommandCatalog(): Promise<CommandCatalog> {
  if (cachedCatalog) return cachedCatalog;

  const plugins = await discoverPlugins();
  const {
    entries: pluginEntries,
    pluginErrors: scanErrors,
    noAuthSetup: pluginNoAuth,
  } = await loadPluginCommandsWithCache(plugins);

  const { commands, pluginErrors: mergeErrors } = mergeCommands(builtinCommands, pluginEntries);

  cachedCatalog = {
    commands,
    noAuthSetup: pluginNoAuth,
    plugins,
    pluginErrors: [...scanErrors, ...mergeErrors],
  };

  return cachedCatalog;
}

/**
 * Reset the command catalog cache.
 */
export function resetCommandCatalogCache(): void {
  cachedCatalog = undefined;
}

export function getCachedCommandCatalog(): CommandCatalog | undefined {
  return cachedCatalog;
}
