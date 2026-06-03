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

/** 扫描单个插件包的 commands 目录 */
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

/** 从命令模块读取元数据（不执行 run） */
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

/** import 一次并提取可缓存的命令元数据 */
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

/** 从缓存元数据构建 Command（启动期不 import，execute 懒加载） */
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

/** 将扫描结果转为可注册 Command（import 读元数据，execute 懒加载） */
export async function buildLazyPluginCommand(
  scanned: ScannedPluginCommand,
): Promise<Command | undefined> {
  const meta = await extractCommandMeta(scanned);
  if (!meta) return undefined;
  return lazyCommandFromMeta(meta);
}

/** 扫描所有插件并构建命令表 */
export async function scanAllPluginCommands(plugins: DiscoveredPlugin[]): Promise<{
  entries: Array<{ path: string; command: Command; plugin: DiscoveredPlugin }>;
  pluginErrors: PluginLoadError[];
  noAuthSetup: string[][];
}> {
  const entries: Array<{ path: string; command: Command; plugin: DiscoveredPlugin }> = [];
  const pluginErrors: PluginLoadError[] = [];
  const noAuthSetup: string[][] = [];

  for (const plugin of plugins) {
    const { commands: scanned, error } = await scanPluginCommands(plugin);
    if (error) pluginErrors.push(error);

    for (const path of plugin.bailianCli.noAuthSetup ?? []) {
      noAuthSetup.push(path.trim().split(/\s+/));
    }

    for (const item of scanned) {
      const meta = await extractCommandMeta(item);
      if (!meta) {
        pluginErrors.push({
          plugin: plugin.name,
          message: `Could not load command module: ${item.commandPath}`,
        });
        continue;
      }
      entries.push({ path: meta.commandPath, command: lazyCommandFromMeta(meta), plugin });
    }
  }

  return { entries, pluginErrors, noAuthSetup };
}
