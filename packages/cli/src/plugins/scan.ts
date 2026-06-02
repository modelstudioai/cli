import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { commandPathToFileBase, fileToCommandPath, type Command } from "bailian-cli-core";
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

/** 将扫描结果转为可注册 Command（execute 懒加载，元数据启动时读取） */
export async function buildLazyPluginCommand(
  scanned: ScannedPluginCommand,
): Promise<Command | undefined> {
  const loaded = await getCachedCommand(scanned.modulePath);
  if (!loaded) return undefined;

  const modulePath = scanned.modulePath;
  return {
    name: loaded.name || scanned.commandPath,
    description: loaded.description,
    usage: loaded.usage,
    options: loaded.options,
    examples: loaded.examples,
    apiDocs: loaded.apiDocs,
    execute: async (config, flags) => {
      const cmd = await getCachedCommand(modulePath);
      if (!cmd) {
        throw new Error(`Failed to load plugin command: ${scanned.commandPath}`);
      }
      return cmd.execute(config, flags);
    },
  };
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
      const cmd = await buildLazyPluginCommand(item);
      if (!cmd) {
        pluginErrors.push({
          plugin: plugin.name,
          message: `Could not load command module: ${item.commandPath}`,
        });
        continue;
      }
      entries.push({ path: item.commandPath, command: cmd, plugin });
    }
  }

  return { entries, pluginErrors, noAuthSetup };
}
