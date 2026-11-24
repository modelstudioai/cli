import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createServer, connect as netConnect, type Socket } from "node:net";
import {
  isDeniedIp,
  startWhitelistProxy,
  withEndpointDomain,
  DEFAULT_PROXY_POLICY,
  type IWhitelistProxy,
} from "../src/index.ts";

// DNS 解析 mock：白名单放行用例返回公网 IP（避免真实网络）；拒绝用例在解析前已被拦截。
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

// 保留真实 connect 供测试客户端使用；代理上游 connect 默认走真实实现，放行用例再改写。
vi.mock("node:net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:net")>();
  return { ...actual, connect: vi.fn(actual.connect) };
});

const { connect: realConnect } = await vi.importActual<typeof import("node:net")>("node:net");

const openProxies: IWhitelistProxy[] = [];
const openSockets: Socket[] = [];
const openServers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.destroy();
  for (const proxy of openProxies.splice(0)) await proxy.close();
  for (const server of openServers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.mocked(netConnect).mockImplementation(realConnect);
});

async function startProxy(
  policy?: Parameters<typeof startWhitelistProxy>[0],
): Promise<IWhitelistProxy> {
  const proxy = await startWhitelistProxy(policy);
  openProxies.push(proxy);
  return proxy;
}

function clientSocket(port: number): Socket {
  const socket = realConnect({ host: "127.0.0.1", port });
  openSockets.push(socket);
  return socket;
}

/** 发送原始请求并读到首个响应头结束（\r\n\r\n）。 */
function readHead(socket: Socket, raw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\r\n\r\n")) {
        socket.off("data", onData);
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.on("error", reject);
    socket.write(raw);
  });
}

describe("isDeniedIp", () => {
  test("denies loopback / private / link-local / metadata / reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isDeniedIp(ip)).toBe(true);
    }
  });

  test("allows public addresses", () => {
    expect(isDeniedIp("93.184.216.34")).toBe(false);
    expect(isDeniedIp("8.8.8.8")).toBe(false);
    expect(isDeniedIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  test("denies unrecognized input", () => {
    expect(isDeniedIp("not-an-ip")).toBe(true);
  });
});

describe("whitelist proxy (real loopback)", () => {
  test("denies an unrelated domain with 403", async () => {
    const proxy = await startProxy();
    const socket = clientSocket(proxy.port);
    const head = await readHead(
      socket,
      "CONNECT evil.example.com:443 HTTP/1.1\r\nHost: evil.example.com:443\r\n\r\n",
    );
    expect(head).toContain("403");
  });

  test("denies non-443 ports even for an allowed domain", async () => {
    const proxy = await startProxy();
    const socket = clientSocket(proxy.port);
    const head = await readHead(
      socket,
      "CONNECT dashscope.aliyuncs.com:80 HTTP/1.1\r\nHost: dashscope.aliyuncs.com:80\r\n\r\n",
    );
    expect(head).toContain("403");
  });

  test("denies plain HTTP requests with 403", async () => {
    const proxy = await startProxy();
    const socket = clientSocket(proxy.port);
    const head = await readHead(
      socket,
      "GET http://dashscope.aliyuncs.com/ HTTP/1.1\r\nHost: dashscope.aliyuncs.com\r\n\r\n",
    );
    expect(head).toContain("403");
  });

  test("denies a private IP literal even when host policy would allow it", async () => {
    const proxy = await startProxy({
      policy: { managementDomains: ["127.0.0.1"], ossSuffixes: [], allowedPorts: [443] },
    });
    const socket = clientSocket(proxy.port);
    const head = await readHead(
      socket,
      "CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n",
    );
    expect(head).toContain("403");
  });

  test("allows an approved management host on 443 and tunnels bytes", async () => {
    // 真实回环 echo 上游；代理上游 connect 改写到它（DNS 已 mock 成公网 IP 通过 IP 校验）。
    const echo = createServer((socket) => socket.pipe(socket));
    openServers.push(echo);
    await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", () => resolve()));
    const echoPort = (echo.address() as { port: number }).port;
    vi.mocked(netConnect).mockImplementation(((_options: unknown, callback?: () => void) =>
      realConnect({ host: "127.0.0.1", port: echoPort }, callback)) as typeof netConnect);

    const events: string[] = [];
    const proxy = await startProxy({
      onEvent: (event) => events.push(`${event.type}:${event.host}:${event.port}`),
    });
    const socket = clientSocket(proxy.port);
    const head = await readHead(
      socket,
      "CONNECT dashscope.aliyuncs.com:443 HTTP/1.1\r\nHost: dashscope.aliyuncs.com:443\r\n\r\n",
    );
    expect(head).toContain("200");

    const echoed = await new Promise<string>((resolve, reject) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk.toString("utf8")));
      socket.once("error", reject);
      socket.write("ping");
    });
    expect(echoed).toBe("ping");
    expect(events).toContain("allow:dashscope.aliyuncs.com:443");
  });
});

describe("withEndpointDomain", () => {
  test("adds the configured workspace gateway host to the management whitelist", () => {
    const policy = withEndpointDomain(
      DEFAULT_PROXY_POLICY,
      "https://ws-abc.cn-beijing.maas.aliyuncs.com",
    );
    expect(policy.managementDomains).toContain("ws-abc.cn-beijing.maas.aliyuncs.com");
    expect(policy.managementDomains).toContain("dashscope.aliyuncs.com");
  });

  test("does not mutate the original policy", () => {
    const before = [...DEFAULT_PROXY_POLICY.managementDomains];
    withEndpointDomain(DEFAULT_PROXY_POLICY, "https://ws-abc.cn-beijing.maas.aliyuncs.com");
    expect(DEFAULT_PROXY_POLICY.managementDomains).toEqual(before);
  });

  test("extracts hostname ignoring path and stays idempotent for known hosts", () => {
    const policy = withEndpointDomain(
      DEFAULT_PROXY_POLICY,
      "https://dashscope.aliyuncs.com/api/v1",
    );
    expect(
      policy.managementDomains.filter((domain) => domain === "dashscope.aliyuncs.com"),
    ).toHaveLength(1);
  });

  test("returns the policy unchanged for missing or invalid base_url", () => {
    expect(withEndpointDomain(DEFAULT_PROXY_POLICY)).toBe(DEFAULT_PROXY_POLICY);
    expect(withEndpointDomain(DEFAULT_PROXY_POLICY, "not a url")).toBe(DEFAULT_PROXY_POLICY);
  });
});
