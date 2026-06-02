import type { Command } from "bailian-cli-core";
import type { DiscoveredPlugin, PluginLoadError } from "./types.ts";

export interface PluginCommandEntry {
  path: string;
  command: Command;
  plugin: DiscoveredPlugin;
}

export interface MergeResult {
  commands: Record<string, Command>;
  pluginErrors: PluginLoadError[];
}

/**
 * 合并内置命令与插件命令。
 * 内置命令优先；插件不能覆盖内置；两插件同名命令记为错误。
 */
export function mergeCommands(
  builtin: Record<string, Command>,
  pluginEntries: PluginCommandEntry[],
): MergeResult {
  const merged: Record<string, Command> = { ...builtin };
  const pluginErrors: PluginLoadError[] = [];
  const owners = new Map<string, DiscoveredPlugin>();

  for (const entry of pluginEntries) {
    const { path, command, plugin } = entry;
    if (path in builtin) {
      pluginErrors.push({
        plugin: plugin.name,
        message: `Plugin command "${path}" conflicts with a built-in command and was skipped.`,
      });
      continue;
    }
    const existing = owners.get(path);
    if (existing) {
      pluginErrors.push({
        plugin: plugin.name,
        message: `Plugin command "${path}" conflicts with plugin "${existing.name}" and was skipped.`,
      });
      continue;
    }
    owners.set(path, plugin);
    merged[path] = command;
  }

  return { commands: merged, pluginErrors };
}
