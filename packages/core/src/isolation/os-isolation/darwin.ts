/**
 * macOS：sandbox-exec + SBPL deny-default。
 *
 * 凭据禁读机制：(deny default) 默认拒绝一切读，只显式 allow 运行时与任务目录；
 * 真实用户 home（含 ~/.dashscope）不在 allow 列表 → 子进程读它返回 EPERM。
 * 嵌套沙箱导致 sandbox-exec 不可用时凭据禁读无法强制 → fail-closed。
 */

import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IIsolationAdapter, IIsolationCapability, IIsolationSpec } from "../types.ts";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** SBPL 字符串字面量转义。 */
function sbplQuote(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 生成 deny-default + 显式 allow 的 SBPL profile。 */
export function buildSbplProfile(spec: IIsolationSpec): string {
  const proxyPort = spec.proxyPort ?? 0;
  const readPaths = [
    spec.runtimeRoot,
    // cwd 由调用方指定（默认 taskDir，带代码包的命令为 deploy-copy），getcwd() 需读 cwd 目录本身；
    // 两者都在读允许集，仅允许子目录会让 rich 等库的 os.getcwd() 报 EPERM。
    spec.taskDir,
    spec.snapshotDir,
    spec.dataDir,
    spec.deployCopyDir,
    spec.tmpDir,
    spec.homeDir,
    "/usr/lib",
    "/System/Library",
    "/private/var/db/dyld",
    // 系统 CA 证书（ssl 默认 /private/etc/ssl/cert.pem）：放行才能做 TLS 证书校验，
    // 否则 SDK 上传/注册函数报 CERTIFICATE_VERIFY_FAILED。与 linux 绑定 /etc/ssl/certs 对齐。
    "/private/etc/ssl",
  ];
  const writePaths = [spec.deployCopyDir, spec.tmpDir, spec.homeDir];

  const readRules = readPaths.map((path) => `  (subpath ${sbplQuote(path)})`).join("\n");
  const writeRules = writePaths.map((path) => `  (subpath ${sbplQuote(path)})`).join("\n");

  return `(version 1)
(deny default)
(allow file-read*
${readRules}
  (literal ${sbplQuote(spec.configPath)})
  (literal "/dev/urandom")
  (literal "/dev/null")
  ; 根目录读权限：dyld 启动解析绝对路径需读根 inode，缺失则解释器 SIGABRT（exit 134）且无输出。
  ; 仅放开根目录自身（readdir/stat），不放开任意文件，真实 home/凭据仍被 deny-default 禁读。
  (literal "/"))
(allow file-write*
${writeRules})
(allow network-outbound (remote tcp "localhost:${proxyPort}"))
(allow process-exec (subpath ${sbplQuote(spec.runtimeRoot)}))
(allow process-fork)
(allow sysctl-read)
(allow mach-lookup)
`;
}

/** 探测 sandbox-exec 是否可用（非嵌套沙箱）。 */
export function probeSandboxExec(): IIsolationCapability {
  const hardening = { networkEnforce: true, processTree: true, memoryLimit: false };
  if (!existsSync(SANDBOX_EXEC)) {
    return {
      credentialDenyRead: {
        available: false,
        mechanism: "sbpl",
        reason: "sandbox-exec not found.",
      },
      hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
    };
  }
  const probe = spawnSync(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"], {
    shell: false,
    timeout: 10_000,
  });
  if (probe.status === 0) {
    return { credentialDenyRead: { available: true, mechanism: "sbpl" }, hardening };
  }
  return {
    credentialDenyRead: {
      available: false,
      mechanism: "sbpl",
      reason: "sandbox-exec is unavailable (nested sandbox or restricted host).",
    },
    hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
  };
}

/** 创建 macOS 适配器。 */
export function createDarwinAdapter(): IIsolationAdapter {
  let profilePath: string | undefined;
  return {
    detect: async () => probeSandboxExec(),
    prepare: async (spec) => {
      profilePath = join(spec.taskDir, "profile.sb");
      writeFileSync(profilePath, buildSbplProfile(spec), "utf8");
    },
    wrapCommand: (spec, command) => {
      const profile = profilePath ?? join(spec.taskDir, "profile.sb");
      return [SANDBOX_EXEC, "-f", profile, ...command];
    },
    dispose: async () => {
      if (profilePath && existsSync(profilePath)) {
        try {
          unlinkSync(profilePath);
        } catch {
          // 清理失败不影响结果
        }
      }
      profilePath = undefined;
    },
  };
}
