import type { ConfigFile } from "./schema.ts";
import { readConfigFile, writeConfigFile } from "./loader.ts";
import { getConfigPath } from "./paths.ts";

/**
 * config 命令族的持久化能力面(lint 限定 commands/config/** 使用)。
 * 读写都直达磁盘(非 dispatch 时的快照),与现有 config set/show 的行为一致。
 */
export interface ConfigStore {
  read(): ConfigFile;
  /** 合并写入;patch 里值为 undefined 的键会被删除。 */
  write(patch: Partial<ConfigFile>): Promise<void>;
  /** 删除指定键。 */
  unset(keys: (keyof ConfigFile)[]): Promise<void>;
  path: string;
  configName?: string;
}

export function makeConfigStore(configName?: string): ConfigStore {
  return {
    read: () => readConfigFile(configName),
    async write(patch) {
      const existing = readConfigFile(configName) as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete existing[key];
        else existing[key] = value;
      }
      await writeConfigFile(existing, configName);
    },
    async unset(keys) {
      const existing = readConfigFile(configName) as Record<string, unknown>;
      for (const key of keys) delete existing[key];
      await writeConfigFile(existing, configName);
    },
    get path() {
      return getConfigPath();
    },
    get configName() {
      return configName;
    },
  };
}
