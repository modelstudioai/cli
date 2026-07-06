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
}

export function makeConfigStore(): ConfigStore {
  return {
    read: () => readConfigFile(),
    async write(patch) {
      const existing = readConfigFile() as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete existing[key];
        else existing[key] = value;
      }
      await writeConfigFile(existing);
    },
    async unset(keys) {
      const existing = readConfigFile() as Record<string, unknown>;
      for (const key of keys) delete existing[key];
      await writeConfigFile(existing);
    },
    get path() {
      return getConfigPath();
    },
  };
}
