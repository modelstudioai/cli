/**
 * Windows：AppContainer fail-closed 占位。
 *
 * 凭据禁读须用 AppContainer（不是 Job Object——后者只管进程/资源，不管文件路径），
 * 需 N-API 原生模块（CreateAppContainerProfile / SetSecurityInfo / CreateProcess +
 * SECURITY_CAPABILITIES）。原生模块与 Python DLL/代理/三库兼容性实测列为延后项。
 * 当前 win32 上 detect 返回不可用 → app-layer fail-closed，
 * 不创建任何云资源。接口预留，待原生模块落地后替换实现。
 */

import type { IIsolationAdapter } from "../types.ts";

/** 创建 Windows 适配器（当前 fail-closed 占位）。 */
export function createWindowsAdapter(): IIsolationAdapter {
  return {
    detect: async () => ({
      credentialDenyRead: {
        available: false,
        mechanism: "appcontainer",
        reason: "Not supported on Windows yet.",
      },
      hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
    }),
    prepare: async () => {
      // 占位：原生模块落地后在此创建 AppContainer profile 并授权自建目录 SID。
    },
    wrapCommand: (_spec, command) => command,
    dispose: async () => {},
  };
}
