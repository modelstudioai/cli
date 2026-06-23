import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { BailianError, ExitCode } from "bailian-cli-core";

export interface ProxyEnv {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
}

function pick(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * 读取代理环境变量（小写优先，与 curl 约定一致）。
 * 空白值视为未设置——undici 自身用 `??` 取值，空字符串的小写变量会屏蔽
 * 已设置的大写变量，这里统一清洗后显式传入，绕开该坑。
 */
export function readProxyEnv(env: NodeJS.ProcessEnv = process.env): ProxyEnv {
  return {
    httpProxy: pick(env, "http_proxy", "HTTP_PROXY"),
    httpsProxy: pick(env, "https_proxy", "HTTPS_PROXY"),
    noProxy: pick(env, "no_proxy", "NO_PROXY"),
  };
}

// Node 内置 fetch（undici）默认不读取代理环境变量，VPN / 公司代理环境下会
// 绕过代理直连而被拦截（见 issue #35）。仅当用户显式设置了 HTTP_PROXY /
// HTTPS_PROXY 时才安装代理 dispatcher（同时支持 NO_PROXY），未设置时不触碰
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
