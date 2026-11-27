import type { ConfigFile } from "./schema.ts";
import {
  activateConfigProfile,
  readConfigFile,
  readConfigProfiles,
  validateConfigProfileActivation,
  mutateConfigFile,
  type ConfigProfiles,
} from "./loader.ts";
import { getConfigPath } from "./paths.ts";
import { normalizeModelBaseUrl } from "./model-base-url.ts";

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

export function makeConfigStore(
  configName?: string,
  configurationPath = getConfigPath(),
): ConfigStore {
  return {
    read: () => readConfigFile(configName, configurationPath),
    async write(patch) {
      await mutateConfigFile(
        (current) => {
          const existing = { ...current } as Record<string, unknown>;
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) delete existing[key];
            else
              existing[key] = key === "base_url" ? normalizeModelBaseUrl(value as string) : value;
          }
          return existing as ConfigFile;
        },
        configName,
        { path: configurationPath },
      );
    },
    async unset(keys) {
      await mutateConfigFile(
        (current) => {
          const existing = { ...current };
          for (const key of keys) delete existing[key];
          return existing;
        },
        configName,
        { path: configurationPath },
      );
    },
    profiles: () => readConfigProfiles(configurationPath),
    activate: (name) => activateConfigProfile(name, configurationPath),
    validateActivation: (name) => validateConfigProfileActivation(name, configurationPath),
    get path() {
      return configurationPath;
    },
  };
}
