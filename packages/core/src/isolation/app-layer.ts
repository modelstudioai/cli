/**
 * 确定性应用层编排。
 *
 * detect → fail-closed 闸门 → OS prepare → 白名单代理 → 最小环境 → home 预生成
 * → 受控进程 → 脱敏 → 关代理。环境闭环（凭据禁读）不可用时在创建任何云资源前
 * fail-closed；快照/临时 YAML 由命令层组装后经 layout 传入，本模块保持通用。
 */

import { rmSync } from "node:fs";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { buildSandboxEnv, prepareTaskHome } from "./env.ts";
import type { ITaskDirLayout } from "./paths.ts";
import { DEFAULT_PROXY_POLICY, startWhitelistProxy, withEndpointDomain } from "./proxy.ts";
import { runSandboxedProcess } from "./process.ts";
import type { IIsolationAdapter, IIsolationResult, IIsolationSpec, IProxyPolicy } from "./types.ts";

/** 一次隔离执行的输入（任务目录与命令由命令层组装）。 */
export interface IIsolatedRunInput {
  layout: ITaskDirLayout;
  runtimeRoot: string;
  /** 完整 argv，含解释器，如 [python, -I, -m, dashscope, ...]。 */
  command: string[];
  apiKey: string;
  baseUrl?: string;
  credentialDenyPaths: string[];
  network?: IProxyPolicy;
  timeoutMs: number;
  maxOutputBytes: number;
  logLevel?: string;
  /** 受控 SDK 环境变量（如 FC_PYPI_LIB），由黑盒显式注入，绝不从宿主继承。 */
  sdkEnv?: Record<string, string>;
  /** 沙箱进程 cwd，默认 taskDir。SDK 会相对 cwd 写部署文件（如 start.sh），
   * 带代码包的命令须传 deployCopyDir，使相对写入落在可写的代码包内。 */
  cwd?: string;
  signal?: AbortSignal;
}

/** 日志脱敏：OSS 签名参数与 API Key。 */
export function sanitizeSecrets(text: string): string {
  return text
    .replace(/OSSAccessKeyId=[^&\s"']+/g, "OSSAccessKeyId=***")
    .replace(/Signature=[^&\s"']+/g, "Signature=***")
    .replace(/sk-[A-Za-z0-9]+/g, "sk-***");
}

function buildSpec(input: IIsolatedRunInput): IIsolationSpec {
  const { layout } = input;
  return {
    runId: layout.runId,
    runtimeRoot: input.runtimeRoot,
    taskDir: layout.taskDir,
    snapshotDir: layout.snapshotDir,
    deployCopyDir: layout.deployCopyDir,
    dataDir: layout.dataDir,
    homeDir: layout.homeDir,
    tmpDir: layout.tmpDir,
    cacheDir: layout.cacheDir,
    configPath: layout.configPath,
    command: input.command,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    credentialDenyPaths: input.credentialDenyPaths,
    network: input.network ?? DEFAULT_PROXY_POLICY,
    timeoutMs: input.timeoutMs,
    maxOutputBytes: input.maxOutputBytes,
    logLevel: input.logLevel,
    sdkEnv: input.sdkEnv,
  };
}

/**
 * 在两层隔离下执行命令。环境闭环不可用时 fail-closed（不创建任何云资源）。
 */
export async function executeIsolatedRun(
  input: IIsolatedRunInput,
  adapter: IIsolationAdapter,
): Promise<IIsolationResult> {
  const capability = await adapter.detect();
  if (!capability.credentialDenyRead.available) {
    const reason = capability.credentialDenyRead.reason ?? "Credential isolation is unavailable.";
    throw new BailianError(
      reason,
      ExitCode.GENERAL,
      "No cloud resources were created. See the runtime doctor command for diagnostics.",
    );
  }

  const spec = buildSpec(input);
  // 白名单须包含用户配置的服务端点 host（workspace 网关等），否则 SDK 经代理访问被 403。
  const proxy = await startWhitelistProxy({
    policy: withEndpointDomain(spec.network, spec.baseUrl),
  });
  spec.proxyPort = proxy.port;

  try {
    await adapter.prepare(spec);
    const env = buildSandboxEnv({
      homeDir: spec.homeDir,
      tmpDir: spec.tmpDir,
      cacheDir: spec.cacheDir,
      runtimeRoot: spec.runtimeRoot,
      apiKey: spec.apiKey,
      baseUrl: spec.baseUrl,
      proxyPort: proxy.port,
      logLevel: spec.logLevel,
      sdkEnv: spec.sdkEnv,
    });
    prepareTaskHome(spec.homeDir, spec.baseUrl);

    const result = await runSandboxedProcess({
      command: spec.command,
      env,
      cwd: input.cwd ?? spec.taskDir,
      timeoutMs: spec.timeoutMs,
      maxOutputBytes: spec.maxOutputBytes,
      wrapCommand: (command) => adapter.wrapCommand(spec, command),
      signal: input.signal,
    });

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      stdout: sanitizeSecrets(result.stdout),
      stderr: sanitizeSecrets(result.stderr),
      timedOut: result.timedOut,
      credentialDenyEnforced: capability.credentialDenyRead.available,
      hardening: capability.hardening,
    };
  } finally {
    try {
      await proxy.close();
      await adapter.dispose();
    } finally {
      // 生命周期绑定调用：结束即销毁任务目录（成功/失败/超时同策，不保留）。
      // 崩溃路径（SIGKILL/断电）finally 未执行的孤儿由 runtime clean / prepare
      // 按 TTL 兜底回收。best-effort：清理失败不得掩盖执行结果。
      try {
        rmSync(spec.taskDir, { recursive: true, force: true });
      } catch {
        // 留给 TTL 兜底
      }
    }
  }
}
