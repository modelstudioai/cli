import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { BailianError, ExitCode } from "bailian-cli-core";

export interface ProxyEnv {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
}

function pick(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

/** 读取代理环境变量，空白值视为未设置。 */
export function readProxyEnv(env: NodeJS.ProcessEnv = process.env): ProxyEnv {
  return {
    httpProxy: pick(env, "HTTP_PROXY"),
    httpsProxy: pick(env, "HTTPS_PROXY"),
    noProxy: pick(env, "NO_PROXY"),
  };
}

// Node 内置 fetch（undici）默认不读取代理环境变量，VPN / 公司代理环境下会
// 绕过代理直连而被拦截。仅当用户配置了代理时才安装 dispatcher，未配置时不触碰
// 全局 dispatcher，行为与之前完全一致。
export function setupProxyFromEnv(): void {
  const { httpProxy, httpsProxy, noProxy } = readProxyEnv();
  if (!httpProxy && !httpsProxy) return;
  try {
    setGlobalDispatcher(new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy }));
  } catch (err) {
    throw new BailianError(
      `Invalid proxy configuration: ${err instanceof Error ? err.message : String(err)}`,
      ExitCode.USAGE,
      "Check HTTP_PROXY / HTTPS_PROXY values, e.g. export HTTPS_PROXY=http://127.0.0.1:7890",
      { cause: err },
    );
  }
}
