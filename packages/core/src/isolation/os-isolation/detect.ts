/**
 * 平台探测分派。
 *
 * 按 process.platform 选择 OS 适配器；硬性凭据禁读与增强能力由各适配器分开判定。
 * 平台差异收敛在此分派与各适配层内部，上层逻辑无平台分支。
 */

import type { IIsolationAdapter, IIsolationCapability } from "../types.ts";
import { createDarwinAdapter } from "./darwin.ts";
import { createLinuxAdapter } from "./linux.ts";
import { createWindowsAdapter } from "./windows.ts";

function createUnsupportedAdapter(platform: string): IIsolationAdapter {
  return {
    detect: async () => ({
      credentialDenyRead: {
        available: false,
        mechanism: "none",
        reason: `Not supported on ${platform} yet.`,
      },
      hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
    }),
    prepare: async () => {},
    wrapCommand: (_spec, command) => command,
    dispose: async () => {},
  };
}

/** 按平台创建 OS 隔离适配器。 */
export function createIsolationAdapter(
  platform: NodeJS.Platform = process.platform,
): IIsolationAdapter {
  switch (platform) {
    case "darwin":
      return createDarwinAdapter();
    case "linux":
      return createLinuxAdapter();
    case "win32":
      return createWindowsAdapter();
    default:
      return createUnsupportedAdapter(platform);
  }
}

/** 探测当前（或指定）平台的隔离能力。 */
export async function detectIsolation(
  platform: NodeJS.Platform = process.platform,
): Promise<IIsolationCapability> {
  return createIsolationAdapter(platform).detect();
}
