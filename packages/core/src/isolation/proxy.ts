/**
 * 本地白名单代理。
 *
 * SDK 三库（aiohttp/requests/httpx）均 trust_env=True，设 HTTP_PROXY/HTTPS_PROXY
 * 即可接管全部流量。代理只监听 127.0.0.1，仅放行 CONNECT 443 到管理面精确域名
 * 与 OSS 后缀白名单；DNS 解析后拒绝私网/loopback/link-local/metadata IP（防
 * rebinding）；拒绝明文 HTTP；日志只记 host:port，不记路径/body（避免泄露签名）。
 */

import { lookup } from "node:dns/promises";
import { createServer, type Server } from "node:http";
import { connect as netConnect, isIP } from "node:net";
import type { Duplex } from "node:stream";
import type { IProxyPolicy } from "./types.ts";

/** 默认策略：管理面精确域名 + 全区域 OSS 后缀 + 仅 443。 */
export const DEFAULT_PROXY_POLICY: IProxyPolicy = {
  managementDomains: ["dashscope.aliyuncs.com"],
  ossSuffixes: [".oss-*.aliyuncs.com", ".oss.aliyuncs.com"],
  allowedPorts: [443],
};

export interface IProxyEvent {
  type: "allow" | "deny";
  host: string;
  port: number;
}

export interface IWhitelistProxy {
  port: number;
  close(): Promise<void>;
}

export interface IProxyOptions {
  policy?: IProxyPolicy;
  /** 仅 host:port 级别事件，供诊断/测试；默认无操作。 */
  onEvent?: (event: IProxyEvent) => void;
}

/** 判断 IP 是否属于禁止目标（私网/loopback/link-local/metadata/保留）。 */
export function isDeniedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [first, second] = ip.split(".").map(Number);
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true; // link-local + metadata
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first >= 224) return true; // multicast / reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("::ffff:")) return isDeniedIp(lower.slice(7));
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    return false;
  }
  return true; // 无法识别一律拒绝
}

function matchesManagement(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain.toLowerCase());
}

/**
 * 将用户配置的服务端点 host 并入管理面白名单（返回新策略，不改原对象）。
 * 默认白名单只含legacy dashscope.aliyuncs.com；workspace 网关（ws-*.<region>.maas.aliyuncs.com）
 * 等自定义 base_url 不在其中，SDK 经代理访问会被 403。仅放行精确 host，不放开后缀。
 */
export function withEndpointDomain(policy: IProxyPolicy, baseUrl?: string): IProxyPolicy {
  if (!baseUrl) return policy;
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return policy;
  }
  if (!host || policy.managementDomains.includes(host)) return policy;
  return { ...policy, managementDomains: [...policy.managementDomains, host] };
}

function matchesOssSuffix(host: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => {
    if (suffix.includes("*")) {
      const escaped = suffix.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+");
      return new RegExp(`${escaped}$`).test(host);
    }
    return host.endsWith(suffix);
  });
}

function isAllowedHost(host: string, policy: IProxyPolicy): boolean {
  const normalized = host.toLowerCase();
  return (
    matchesManagement(normalized, policy.managementDomains) ||
    matchesOssSuffix(normalized, policy.ossSuffixes)
  );
}

function splitHostPort(target: string): { host: string; port: number } {
  const lastColon = target.lastIndexOf(":");
  if (lastColon <= 0) return { host: target, port: NaN };
  return { host: target.slice(0, lastColon), port: Number(target.slice(lastColon + 1)) };
}

/** 解析并校验目标 IP；任一地址被禁则拒绝，返回首个可用地址。 */
async function resolveAllowedAddress(host: string): Promise<string> {
  if (isIP(host)) {
    if (isDeniedIp(host)) throw new Error("denied ip");
    return host;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("no address");
  if (addresses.some((entry) => isDeniedIp(entry.address))) throw new Error("denied ip");
  return addresses[0].address;
}

/** 启动白名单代理，监听 127.0.0.1 随机端口。 */
export function startWhitelistProxy(options: IProxyOptions = {}): Promise<IWhitelistProxy> {
  const policy = options.policy ?? DEFAULT_PROXY_POLICY;
  const emit = options.onEvent ?? (() => {});
  const sockets = new Set<Duplex>();

  const track = (socket: Duplex): void => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
  };

  const server: Server = createServer();
  server.on("connect", (req, clientSocket, head) => {
    track(clientSocket);
    const { host, port } = splitHostPort(req.url ?? "");
    if (!host || !policy.allowedPorts.includes(port) || !isAllowedHost(host, policy)) {
      emit({ type: "deny", host, port });
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }
    resolveAllowedAddress(host)
      .then((address) => {
        const upstream = netConnect({ host: address, port }, () => {
          emit({ type: "allow", host, port });
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length > 0) upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        });
        track(upstream);
        upstream.on("error", () => clientSocket.destroy());
      })
      .catch(() => {
        emit({ type: "deny", host, port });
        clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        clientSocket.destroy();
      });
  });

  // 明文 HTTP 一律拒绝（SDK 全走 HTTPS）。
  server.on("request", (_req, res) => {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose) => {
            for (const socket of sockets) socket.destroy();
            sockets.clear();
            server.close(() => resolveClose());
          }),
      });
    });
  });
}
