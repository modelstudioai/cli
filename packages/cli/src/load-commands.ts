import { commands as builtinCommands } from "./commands/catalog.ts";
import { discoverPlugins } from "./plugins/discover.ts";
import { mergeCommands } from "./plugins/priority.ts";
import { scanAllPluginCommands } from "./plugins/scan.ts";
import type { CommandCatalog } from "./plugins/types.ts";

let cachedCatalog: CommandCatalog | undefined;

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
  } = await scanAllPluginCommands(plugins);

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
