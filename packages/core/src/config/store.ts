import type { ConfigFile } from "./schema.ts";
import {
  activateConfigProfile,
  readConfigFile,
  readConfigProfiles,
  validateConfigProfileActivation,
  writeConfigFile,
  type ConfigProfiles,
} from "./loader.ts";
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
  /** 读取所有 Profile 与持久化激活项。 */
  profiles(): ConfigProfiles;
  /** 激活已存在的命名 Profile；undefined/default 激活顶层配置。 */
  activate(name?: unknown): Promise<string>;
  /** 校验激活目标并返回规范化展示名，不落盘。 */
  validateActivation(name?: unknown): string;
  path: string;
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
    profiles: () => readConfigProfiles(),
    activate: (name) => activateConfigProfile(name),
    validateActivation: (name) => validateConfigProfileActivation(name),
    get path() {
      return getConfigPath();
    },
  };
}
