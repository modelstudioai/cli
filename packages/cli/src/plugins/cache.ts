import { existsSync, statSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { OptionDef } from "bailian-cli-core";
import { getPluginsCachePath } from "./paths.ts";
import type { DiscoveredPlugin, PluginSourceType } from "./types.ts";

/**
 * Disk cache schema version
 */
export const COMMANDS_CACHE_SCHEMA = 1;

/**
 * is plugin commands cache disabled
 * @returns true if plugin commands cache is disabled, false otherwise
 */
export function isPluginCommandsCacheDisabled(): boolean {
  return process.env.BAILIAN_CLI_PLUGINS_NO_CACHE === "1";
}

/**
 * Serializable command metadata
 */
export interface CachedCommandMeta {
  commandPath: string;
  modulePath: string;
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  apiDocs?: string;
}

/**
 * Plugin fingerprint: name + version + commands directory mtime
 */
export interface PluginFingerprint {
  name: string;
  version?: string;
  source: PluginSourceType;
  root: string;
  commandsMtimeMs: number;
}

/**
 * Single plugin entry in the cache
 */
export interface CachedPluginEntry {
  fingerprint: PluginFingerprint;
  commands: CachedCommandMeta[];
  /**
   * No-auth setup command paths (space-separated raw strings)
   */
  noAuthSetup: string[];
}

/** ~/.bailian/plugins/commands-cache.json */
export interface CommandsCache {
  schema: typeof COMMANDS_CACHE_SCHEMA;
  cliVersion: string;
  plugins: Record<string, CachedPluginEntry>;
}

/**
 * Compute plugin fingerprint
 * @param plugin - The plugin to compute the fingerprint for
 * @returns The plugin fingerprint
 */
export function computeFingerprint(plugin: DiscoveredPlugin): PluginFingerprint {
  const commandsDir = join(plugin.root, plugin.bailianCli.commands ?? "");
  let commandsMtimeMs = 0;
  if (existsSync(commandsDir)) {
    try {
      commandsMtimeMs = statSync(commandsDir).mtimeMs;
    } catch {
      commandsMtimeMs = 0;
    }
  }
  return {
    name: plugin.name,
    version: plugin.version,
    source: plugin.source,
    root: plugin.root,
    commandsMtimeMs,
  };
}

/**
 * Check if the fingerprints match
 * @param cached - The cached fingerprint
 * @param current - The current fingerprint
 * @returns true if the fingerprints match, false otherwise
 */
export function fingerprintMatches(cached: PluginFingerprint, current: PluginFingerprint): boolean {
  return (
    cached.name === current.name &&
    cached.version === current.version &&
    cached.source === current.source &&
    cached.root === current.root &&
    cached.commandsMtimeMs === current.commandsMtimeMs
  );
}

/**
 * Remove cached entries for uninstalled plugins
 * @param plugins - The plugins to prune
 * @param activeNames - The names of the active plugins
 * @returns The pruned plugins
 */
export function pruneCache(
  plugins: Record<string, CachedPluginEntry>,
  activeNames: string[],
): Record<string, CachedPluginEntry> {
  const active = new Set(activeNames);
  const pruned: Record<string, CachedPluginEntry> = {};
  for (const [name, entry] of Object.entries(plugins)) {
    if (active.has(name)) pruned[name] = entry;
  }
  return pruned;
}

/**
 * Read the disk cache (returns undefined on failure)
 * @returns The commands cache or undefined if the cache is not found or invalid
 */
export async function readCommandsCache(): Promise<CommandsCache | undefined> {
  const path = getPluginsCachePath();
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as CommandsCache;
    if (raw.schema !== COMMANDS_CACHE_SCHEMA) return undefined;
    if (!raw.cliVersion || typeof raw.plugins !== "object") return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/**
 * Write the disk cache (best-effort, silent on failure)
 * @param cache - The commands cache to write
 */
export async function writeCommandsCache(cache: CommandsCache): Promise<void> {
  const path = getPluginsCachePath();
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  } catch {
    /* best-effort */
  }
}

/**
 * Delete the disk cache (invalidated after install/remove/link)
 * @returns The commands cache or undefined if the cache is not found or invalid
 */
export async function clearCommandsCache(): Promise<void> {
  const path = getPluginsCachePath();
  try {
    await unlink(path);
  } catch {
    /* file may not exist */
  }
}
