import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { runCli } from "./helpers.ts";

/**
 * 代理支持 E2E（issue #35）：验证设置 HTTPS_PROXY 后 CLI 流量经过代理，
 * 未设置时保持直连。全程离线——目标域名用 `.invalid`（保留顶级域，必然
 * 无法解析），代理收到 CONNECT 后规范返回 502，不产生真实外网请求。
 */

const FAKE_GATEWAY_HOST = "bl-proxy-e2e.invalid";

/** 记录收到的 CONNECT 目标（host:port），并以 502 拒绝隧道的最小代理 */
let proxy: Server;
let proxyUrl: string;
const connectTargets: string[] = [];

beforeAll(async () => {
  proxy = createServer();
  proxy.on("connect", (req, clientSocket) => {
    connectTargets.push(req.url ?? "");
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
});

/**
 * 注入假 console 凭证：`app list` 在发请求前会解析 console 凭证（`resolveConsoleGatewayCredential`），
 * CI 上无 `~/.bailian/config.json` 也无凭证时会先抛 AUTH 错误、走不到 fetch，代理便收不到 CONNECT。
 * `DASHSCOPE_ACCESS_TOKEN` 优先级最高，注入任意假值即可让请求真正发出、被代理拦截（目标域 .invalid 仍不产生外网流量）。
 */
const PROXY_ENV_CLEARED = {
  HTTPS_PROXY: "",
  https_proxy: "",
  HTTP_PROXY: "",
  http_proxy: "",
  NO_PROXY: "",
  no_proxy: "",
  DASHSCOPE_ACCESS_TOKEN: "bl-proxy-e2e-fake-token",
};

describe("e2e: proxy", () => {
  test("设置 HTTPS_PROXY 后请求经过代理（CONNECT 到目标主机）", async () => {
    connectTargets.length = 0;
    const { exitCode } = await runCli(["app", "list"], {
      ...PROXY_ENV_CLEARED,
      HTTPS_PROXY: proxyUrl,
      BAILIAN_CONSOLE_GATEWAY_URL: `https://${FAKE_GATEWAY_HOST}`,
    });
    // 代理对 CONNECT 返回 502，命令本身按网络错误退出
    expect(exitCode).not.toBe(0);
    expect(connectTargets).toContain(`${FAKE_GATEWAY_HOST}:443`);
  });

  test("空字符串小写变量不屏蔽大写 HTTPS_PROXY（undici ?? 取值回归）", async () => {
    connectTargets.length = 0;
    await runCli(["app", "list"], {
      ...PROXY_ENV_CLEARED,
      https_proxy: "",
      HTTPS_PROXY: proxyUrl,
      BAILIAN_CONSOLE_GATEWAY_URL: `https://${FAKE_GATEWAY_HOST}`,
    });
    expect(connectTargets).toContain(`${FAKE_GATEWAY_HOST}:443`);
  });

  test("NO_PROXY 命中目标主机时不走代理", async () => {
    connectTargets.length = 0;
    await runCli(["app", "list"], {
      ...PROXY_ENV_CLEARED,
      HTTPS_PROXY: proxyUrl,
      NO_PROXY: FAKE_GATEWAY_HOST,
      BAILIAN_CONSOLE_GATEWAY_URL: `https://${FAKE_GATEWAY_HOST}`,
    });
    expect(connectTargets.filter((t) => t.startsWith(FAKE_GATEWAY_HOST))).toEqual([]);
  });

  test("未设置代理变量时保持直连（代理收不到任何流量）", async () => {
    connectTargets.length = 0;
    const { exitCode } = await runCli(["app", "list"], {
      ...PROXY_ENV_CLEARED,
      BAILIAN_CONSOLE_GATEWAY_URL: `https://${FAKE_GATEWAY_HOST}`,
    });
    // .invalid 域名直连必然 DNS 失败
    expect(exitCode).not.toBe(0);
    expect(connectTargets).toEqual([]);
  });

  test("代理 URL 非法时给出明确报错而非堆栈", async () => {
    const { exitCode, stderr } = await runCli(["app", "list"], {
      ...PROXY_ENV_CLEARED,
      HTTPS_PROXY: "::::not-a-url",
      BAILIAN_CONSOLE_GATEWAY_URL: `https://${FAKE_GATEWAY_HOST}`,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Invalid proxy configuration/);
    expect(stderr).toMatch(/HTTPS_PROXY/);
  });
});
