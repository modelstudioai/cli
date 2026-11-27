/**
 * Linux：bwrap 不挂载真实 home。
 *
 * 凭据禁读机制：bwrap 只挂载运行时与任务目录（按真实路径绑定，避免 YAML 路径
 * 重写），真实用户 home（含 ~/.dashscope）根本不进入挂载命名空间 → 子进程读不到。
 * 用户命名空间被禁用时凭据禁读无法强制 → fail-closed。
 *
 * 网络：首版走应用层白名单代理（networkEnforce 降级为 false）；--unshare-net +
 * socat/Unix socket 的内核级断网是延后增强（随运行时捆绑 socat 后启用）。
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { IIsolationAdapter, IIsolationCapability, IIsolationSpec } from "../types.ts";

/** 需要只读绑定的系统目录（存在才绑定）。 */
const SYSTEM_RO_DIRS = ["/usr", "/lib", "/lib64", "/etc/ssl/certs"];

/** 生成 bwrap 参数：只绑定运行时与任务目录，绝不绑定真实 home。 */
export function buildBwrapArgs(spec: IIsolationSpec, command: string[]): string[] {
  const args: string[] = ["--unshare-pid", "--die-with-parent"];

  for (const sysDir of SYSTEM_RO_DIRS) {
    if (existsSync(sysDir)) args.push("--ro-bind", sysDir, sysDir);
  }

  // 运行时只读；任务目录按真实路径绑定（snapshot/data 只读，deploy-copy/tmp/home 可写）。
  args.push("--ro-bind", spec.runtimeRoot, spec.runtimeRoot);
  args.push("--ro-bind", spec.snapshotDir, spec.snapshotDir);
  args.push("--ro-bind", spec.dataDir, spec.dataDir);
  args.push("--bind", spec.deployCopyDir, spec.deployCopyDir);
  args.push("--bind", spec.tmpDir, spec.tmpDir);
  args.push("--bind", spec.homeDir, spec.homeDir);
  args.push("--ro-bind", spec.configPath, spec.configPath);
  args.push("--proc", "/proc", "--dev", "/dev");

  args.push("--", ...command);
  return args;
}

/** 探测 bwrap 存在且用户命名空间可用。 */
export function probeBwrap(): IIsolationCapability {
  const hardening = { networkEnforce: false, processTree: true, memoryLimit: false };
  const probe = spawnSync("bwrap", ["--ro-bind", "/", "/", "--", "/bin/true"], {
    shell: false,
    timeout: 10_000,
  });
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") {
    return {
      credentialDenyRead: {
        available: false,
        mechanism: "bwrap-nobind",
        reason: "bwrap is not installed.",
      },
      hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
    };
  }
  if (probe.status === 0) {
    return { credentialDenyRead: { available: true, mechanism: "bwrap-nobind" }, hardening };
  }
  return {
    credentialDenyRead: {
      available: false,
      mechanism: "bwrap-nobind",
      reason: "bwrap cannot create a user namespace (disabled or restricted host).",
    },
    hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
  };
}

/** 创建 Linux 适配器。 */
export function createLinuxAdapter(): IIsolationAdapter {
  return {
    detect: async () => probeBwrap(),
    prepare: async () => {
      // bwrap 参数在 wrapCommand 内即时生成，无需预写资源。
    },
    wrapCommand: (spec, command) => ["bwrap", ...buildBwrapArgs(spec, command)],
    dispose: async () => {},
  };
}
