/**
 * 环境变量清洗 + home 重定向。
 *
 * 核心：不是"在用户环境上追加"，而是构造一个全新的最小环境对象。凭据/代理/
 * Python 劫持变量一律不继承；home 变量重定向到任务目录，使 SDK 的
 * expanduser("~/.dashscope/...") 解析到任务 home 而非真实 home。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";

/** 构造最小环境所需的输入。 */
export interface ISandboxEnvInput {
  homeDir: string;
  tmpDir: string;
  cacheDir: string;
  runtimeRoot: string;
  apiKey: string;
  baseUrl?: string;
  proxyPort: number;
  logLevel?: string;
  /** 受控 SDK 环境变量（如 FC_PYPI_LIB），由黑盒显式注入，绝不从宿主继承。 */
  sdkEnv?: Record<string, string>;
  /** 目标平台，默认当前进程平台（便于跨平台单测）。 */
  platform?: NodeJS.Platform;
  /** 宿主环境，仅用于挑选必要系统变量（SystemRoot/locale），默认 process.env。 */
  hostEnv?: Record<string, string | undefined>;
}

/**
 * 构造全新最小环境。只包含注入项 + 必要系统变量；其余（DASHSCOPE_CONFIG、
 * DASHSCOPE_API_KEY_FILE_PATH、PYTHONPATH/PYTHONHOME、SSH_AUTH_SOCK、用户代理、
 * AWS / ALIBABA_CLOUD / AZURE 系列凭据变量等）因全新构造而天然不存在。
 */
export function buildSandboxEnv(input: ISandboxEnvInput): Record<string, string> {
  const platform = input.platform ?? process.platform;
  const hostEnv = input.hostEnv ?? process.env;
  const proxyUrl = `http://127.0.0.1:${input.proxyPort}`;
  const env: Record<string, string> = {};

  // 凭据：API Key 优先级最高，SDK 不回退读 api_key 文件。
  env.DASHSCOPE_API_KEY = input.apiKey;
  if (input.baseUrl) env.DASHSCOPE_HTTP_BASE_URL = input.baseUrl;

  env.LOG_LEVEL = input.logLevel ?? "info";
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.XDG_CACHE_HOME = input.cacheDir;

  // 受控 SDK 变量（如 FC_PYPI_LIB 钉住 FC 内安装的 dashscope 版本，与提交端锁步）。
  if (input.sdkEnv) Object.assign(env, input.sdkEnv);

  // 强制全部流量走本地白名单代理；NO_PROXY 为空不让任何域名绕过。
  env.HTTP_PROXY = proxyUrl;
  env.HTTPS_PROXY = proxyUrl;
  env.NO_PROXY = "";

  const runtimeBin = join(input.runtimeRoot, "bin");
  if (platform === "win32") {
    env.TEMP = input.tmpDir;
    env.TMP = input.tmpDir;
    // Windows 必须三变量一致指向任务 home，否则 expanduser 仍可能解析到真实 home。
    env.USERPROFILE = input.homeDir;
    const root = win32.parse(input.homeDir).root;
    const drive = /^[A-Za-z]:/.test(root) ? root.slice(0, 2) : "";
    env.HOMEDRIVE = drive;
    env.HOMEPATH = drive ? input.homeDir.slice(drive.length) : input.homeDir;
    const systemRoot = hostEnv.SystemRoot ?? hostEnv.windir ?? "C:\\Windows";
    env.SystemRoot = systemRoot;
    env.windir = systemRoot;
    env.PATH = `${input.runtimeRoot};${runtimeBin};${join(systemRoot, "System32")};${systemRoot}`;
  } else {
    env.TMPDIR = input.tmpDir;
    env.HOME = input.homeDir;
    env.PATH = `${runtimeBin}:/usr/bin:/bin`;
    // 保留必要 locale，避免 SDK 编码异常。
    for (const localeKey of ["LANG", "LC_ALL"]) {
      const localeValue = hostEnv[localeKey];
      if (localeValue) env[localeKey] = localeValue;
    }
  }

  return env;
}

/**
 * 预生成任务 home 下的 .dashscope/config.toml。
 *
 * API Key 经环境变量注入（优先级最高），刻意不落盘以减少持久化秘密；此处仅
 * 写入非秘密设置（如企业 base_url），确保 SDK 读到受控配置而非回退真实 home。
 */
export function prepareTaskHome(homeDir: string, baseUrl?: string): string {
  const dashscopeDir = join(homeDir, ".dashscope");
  mkdirSync(dashscopeDir, { recursive: true });
  const configPath = join(dashscopeDir, "config.toml");
  const lines = ["# Managed by bailian CLI; credentials are injected via environment."];
  if (baseUrl) lines.push(`base_url = ${JSON.stringify(baseUrl)}`);
  writeFileSync(configPath, `${lines.join("\n")}\n`, "utf8");
  return configPath;
}
