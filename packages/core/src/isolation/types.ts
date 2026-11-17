/**
 * 隔离层类型契约。
 *
 * 两层隔离：确定性应用层（全平台必选）+ OS 强制（环境闭环硬性 fail-closed，
 * 其余增强可降级）。平台差异收敛在 os-isolation/ 适配层，上层逻辑无平台分支。
 */

/** 本地白名单代理策略。 */
export interface IProxyPolicy {
  /** 管理面精确域名，如 dashscope.aliyuncs.com。 */
  managementDomains: string[];
  /** OSS 域名后缀白名单，如 .oss-cn-beijing.aliyuncs.com。 */
  ossSuffixes: string[];
  /** 允许的 CONNECT 端口，首版仅 443。 */
  allowedPorts: number[];
}

/** 一次隔离执行的完整输入。 */
export interface IIsolationSpec {
  runId: string;
  /** 托管 Python + SDK 目录。 */
  runtimeRoot: string;
  /** <data>/runs/<run-id>。 */
  taskDir: string;
  snapshotDir: string;
  deployCopyDir: string;
  dataDir: string;
  /** 重定向的 HOME/USERPROFILE。 */
  homeDir: string;
  tmpDir: string;
  cacheDir: string;
  configPath: string;
  /** [python, -I, -m, dashscope, ...]。 */
  command: string[];
  /** 注入用，绝不进日志。 */
  apiKey: string;
  /** 企业 profile 指定时才注入 DASHSCOPE_HTTP_BASE_URL。 */
  baseUrl?: string;
  /** 真实凭据路径，OS 禁读目标（如真实 ~/.dashscope）。 */
  credentialDenyPaths: string[];
  network: IProxyPolicy;
  /** 本地代理端口（app-layer 启动代理后回填，供 OS 网络放行）。 */
  proxyPort?: number;
  timeoutMs: number;
  maxOutputBytes: number;
  logLevel?: string;
  /** 受控 SDK 环境变量（如 FC_PYPI_LIB），由黑盒显式注入，绝不从宿主继承。 */
  sdkEnv?: Record<string, string>;
}

/** 增强能力实际启用情况（可降级，不阻断）。 */
export interface IIsolationHardening {
  networkEnforce: boolean;
  processTree: boolean;
  memoryLimit: boolean;
}

/** 平台探测结果：硬性凭据禁读与增强分开判定。 */
export interface IIsolationCapability {
  credentialDenyRead: {
    available: boolean;
    mechanism: "sbpl" | "bwrap-nobind" | "appcontainer" | "none";
    reason?: string;
  };
  hardening: IIsolationHardening;
}

/** 一次隔离执行的结果。 */
export interface IIsolationResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** 凭据禁读是否由 OS 强制（硬性，必须 true 才执行）。 */
  credentialDenyEnforced: boolean;
  hardening: IIsolationHardening;
}

/** OS 适配层统一接口。app-layer 负责编排，OS 层只注入强制 argv 与资源准备。 */
export interface IIsolationAdapter {
  /** 探测凭据禁读能力；不可用则 run 前 fail-closed。 */
  detect(): Promise<IIsolationCapability>;
  /** OS 资源准备（如写 SBPL profile、授权 SID）。 */
  prepare(spec: IIsolationSpec): Promise<void>;
  /** 把原始 argv 包装成 OS 强制 argv（sandbox-exec / bwrap）；无包装原样返回。 */
  wrapCommand(spec: IIsolationSpec, command: string[]): string[];
  dispose(): Promise<void>;
}
