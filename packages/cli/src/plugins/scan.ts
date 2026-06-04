import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { commandPathToFileBase, fileToCommandPath, type Command } from "bailian-cli-core";
import type { CachedCommandMeta } from "./cache.ts";
import type { DiscoveredPlugin, PluginLoadError, ScannedPluginCommand } from "./types.ts";

const COMMAND_EXTENSIONS = [".js", ".mjs", ".ts"] as const;

async function walkCommandFiles(dir: string, prefix: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = String(entry.name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (entry.isDirectory()) {
      await walkCommandFiles(join(dir, entry.name), rel, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(test|spec|d)\.(js|mjs|ts)$/.test(name)) continue;
    if (!/\.(js|mjs|ts)$/.test(name)) continue;
    out.push(rel.replace(/\\/g, "/"));
  }
}

function resolveCommandModulePath(commandsDir: string, commandPath: string): string | undefined {
  const base = commandPathToFileBase(commandPath);
  for (const ext of COMMAND_EXTENSIONS) {
    const direct = join(commandsDir, `${base}${ext}`);
    if (existsSync(direct)) return direct;
  }
  for (const ext of COMMAND_EXTENSIONS) {
    const indexFile = join(commandsDir, base, `index${ext}`);
    if (existsSync(indexFile)) return indexFile;
  }
  return undefined;
}

export async function scanPluginCommands(
  plugin: DiscoveredPlugin,
): Promise<{ commands: ScannedPluginCommand[]; error?: PluginLoadError }> {
  const commandsDir = join(plugin.root, plugin.bailianCli.commands ?? "");
  if (!existsSync(commandsDir)) {
    return {
      commands: [],
      error: {
        plugin: plugin.name,
        message: `Commands directory not found: ${plugin.bailianCli.commands}`,
      },
    };
  }

  const files: string[] = [];
  await walkCommandFiles(commandsDir, "", files);

  const commands: ScannedPluginCommand[] = [];
  for (const file of files) {
    const commandPath = fileToCommandPath(file);
    if (!commandPath) continue;
    const modulePath = resolveCommandModulePath(commandsDir, commandPath);
    if (!modulePath) continue;
    commands.push({ commandPath, modulePath, plugin });
  }

  return { commands };
}

/** Whether a noAuthSetup rule is a prefix of a plugin command path. */
function isNoAuthRuleForCommand(rule: string[], commandPath: string[]): boolean {
  if (rule.length > commandPath.length) return false;
  return rule.every((segment, i) => commandPath[i] === segment);
}

/**
 * Keep only noAuthSetup entries that prefix-match a command owned by this plugin.
 * Rejects rules like "text" that would skip auth setup for unrelated built-in commands.
 */
export function filterValidNoAuthSetup(
  plugin: DiscoveredPlugin,
  pluginCommandPaths: string[],
): { paths: string[]; errors: PluginLoadError[] } {
  const rawPaths = (plugin.bailianCli.noAuthSetup ?? []).map((p) => p.trim()).filter(Boolean);
  const commandSegments = pluginCommandPaths.map((p) => p.split(/\s+/).filter(Boolean));
  const paths: string[] = [];
  const errors: PluginLoadError[] = [];

  for (const raw of rawPaths) {
    const rule = raw.split(/\s+/).filter(Boolean);
    if (rule.length === 0) continue;

    const matches = commandSegments.some((cp) => isNoAuthRuleForCommand(rule, cp));
    if (matches) {
      paths.push(raw);
    } else {
      errors.push({
        plugin: plugin.name,
        message: `noAuthSetup "${raw}" does not match any command provided by this plugin and was ignored.`,
      });
    }
  }

  return { paths, errors };
}

/** load command metadata from module (without executing run) */
async function loadCommandMetadata(modulePath: string): Promise<Command | undefined> {
  try {
    const mod = await import(pathToFileURL(modulePath).href);
    const cmd = (mod.default ?? mod) as Command;
    if (!cmd || typeof cmd.execute !== "function") return undefined;
    return cmd;
  } catch {
    return undefined;
  }
}

const moduleCache = new Map<string, Promise<Command | undefined>>();

function getCachedCommand(modulePath: string): Promise<Command | undefined> {
  let pending = moduleCache.get(modulePath);
  if (!pending) {
    pending = loadCommandMetadata(modulePath);
    moduleCache.set(modulePath, pending);
  }
  return pending;
}

/** import once and extract cacheable command metadata */
export async function extractCommandMeta(
  scanned: ScannedPluginCommand,
): Promise<CachedCommandMeta | undefined> {
  const loaded = await getCachedCommand(scanned.modulePath);
  if (!loaded) return undefined;
  return {
    commandPath: scanned.commandPath,
    modulePath: scanned.modulePath,
    name: loaded.name || scanned.commandPath,
    description: loaded.description,
    usage: loaded.usage,
    options: loaded.options,
    examples: loaded.examples,
    apiDocs: loaded.apiDocs,
  };
}

/** build Command from cached metadata (do not import during startup, lazy load execute) */
export function lazyCommandFromMeta(meta: CachedCommandMeta): Command {
  const modulePath = meta.modulePath;
  return {
    name: meta.name,
    description: meta.description,
    usage: meta.usage,
    options: meta.options,
    examples: meta.examples,
    apiDocs: meta.apiDocs,
    execute: async (config, flags) => {
      const cmd = await getCachedCommand(modulePath);
      if (!cmd) {
        throw new Error(`Failed to load plugin command: ${meta.commandPath}`);
      }
      return cmd.execute(config, flags);
    },
  };
}
