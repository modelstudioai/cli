import { execFile } from "child_process";
import { createServer, type Server } from "http";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { cliPackageRoot } from "./helpers.ts";

const execFileAsync = promisify(execFile);

/**
 * 代理支持 E2E（issue #35）：只验证 `setupProxyFromEnv()` 是否把代理 dispatcher
 * 正确装到全局 fetch 上——设了 HTTPS_PROXY 后裸 `fetch()` 走代理，未设置时直连，
 * NO_PROXY 命中时跳过，非法代理值给出明确报错。
 *
 * 不经过任何 CLI 命令（不解析凭证、不打 gateway），因此 CI 上无需 api key /
 * access token，与既有 e2e 设计一致。全程离线：目标域名用 `.invalid`（保留顶级域，
 * 必然无法解析），代理收到 CONNECT 后规范返回 502，不产生真实外网请求。
 */

const FAKE_HOST = "bl-proxy-e2e.invalid";
const FAKE_URL = `https://${FAKE_HOST}/probe`;

/**
 * 最小探针脚本：调用真实的 `setupProxyFromEnv()`，再对目标发一个普通 fetch。
 * 代理行为由进程环境变量决定，正是被测对象；fetch 成败不重要，我们只看代理是否收到 CONNECT。
 */
const PROBE_SCRIPT = `
import { setupProxyFromEnv } from ${JSON.stringify(join(cliPackageRoot, "..", "runtime", "src", "proxy.ts"))};
setupProxyFromEnv();
try {
  await fetch(${JSON.stringify(FAKE_URL)}, { signal: AbortSignal.timeout(5000) });
} catch {
  // 目标不可达/隧道被拒都正常——本测试只关心代理是否收到 CONNECT
}
`;

let proxy: Server;
let proxyUrl: string;
let scriptDir: string;
let scriptPath: string;
const connectTargets: string[] = [];

beforeAll(async () => {
  proxy = createServer();
  // 记录收到的 CONNECT 目标（host:port），并以 502 拒绝隧道
  proxy.on("connect", (req, clientSocket) => {
    connectTargets.push(req.url ?? "");
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;

  scriptDir = mkdtempSync(join(tmpdir(), "bl-proxy-e2e-"));
  scriptPath = join(scriptDir, "probe.ts");
  writeFileSync(scriptPath, PROBE_SCRIPT);
});

afterAll(async () => {
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  rmSync(scriptDir, { recursive: true, force: true });
});

/** 清空所有代理相关环境变量，确保每个用例只受自身设置影响 */
const PROXY_ENV_CLEARED = {
  HTTPS_PROXY: "",
  https_proxy: "",
  HTTP_PROXY: "",
  http_proxy: "",
  NO_PROXY: "",
  no_proxy: "",
};

/** 以给定代理环境变量运行探针脚本，返回 { exitCode, stderr } */
async function runProbe(
  envOverrides: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stderr: string }> {
  try {
    await execFileAsync("node", [scriptPath], {
      cwd: cliPackageRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1", ...PROXY_ENV_CLEARED, ...envOverrides },
    });
    return { exitCode: 0, stderr: "" };
  } catch (err: unknown) {
    const e = err as { stderr?: string; code?: number };
    return { exitCode: typeof e.code === "number" ? e.code : 1, stderr: e.stderr ?? "" };
  }
}

describe("e2e: proxy", () => {
  test("设置 HTTPS_PROXY 后 fetch 经过代理（CONNECT 到目标主机）", async () => {
    connectTargets.length = 0;
    await runProbe({ HTTPS_PROXY: proxyUrl });
    expect(connectTargets).toContain(`${FAKE_HOST}:443`);
  });

  test("空字符串小写变量不屏蔽大写 HTTPS_PROXY（undici ?? 取值回归）", async () => {
    connectTargets.length = 0;
    await runProbe({ https_proxy: "", HTTPS_PROXY: proxyUrl });
    expect(connectTargets).toContain(`${FAKE_HOST}:443`);
  });

  test("NO_PROXY 命中目标主机时不走代理", async () => {
    connectTargets.length = 0;
    await runProbe({ HTTPS_PROXY: proxyUrl, NO_PROXY: FAKE_HOST });
    expect(connectTargets.filter((t) => t.startsWith(FAKE_HOST))).toEqual([]);
  });

  test("未设置代理变量时保持直连（代理收不到任何流量）", async () => {
    connectTargets.length = 0;
    await runProbe({});
    expect(connectTargets).toEqual([]);
  });

  test("代理 URL 非法时给出明确报错而非堆栈", async () => {
    const { exitCode, stderr } = await runProbe({ HTTPS_PROXY: "::::not-a-url" });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Invalid proxy configuration/);
    expect(stderr).toMatch(/HTTPS_PROXY/);
  });
});
