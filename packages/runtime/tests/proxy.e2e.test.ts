import { execFile } from "child_process";
import { createServer, type Server } from "http";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);

const runtimePackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 代理支持 E2E：验证 `setupProxyFromEnv()` 是否把代理 dispatcher 正确装到全局 fetch 上。
 * 不经过 CLI 命令，CI 无需 api key。
 */

const FAKE_HOST = "bl-proxy-e2e.invalid";
const FAKE_URL = `https://${FAKE_HOST}/probe`;

const PROBE_SCRIPT = `
import { setupProxyFromEnv } from ${JSON.stringify(join(runtimePackageRoot, "src", "proxy.ts"))};
setupProxyFromEnv();
try {
  await fetch(${JSON.stringify(FAKE_URL)}, { signal: AbortSignal.timeout(5000) });
} catch {
  // 目标不可达/隧道被拒都正常
}
`;

let proxy: Server;
let proxyUrl: string;
let scriptDir: string;
let scriptPath: string;
const connectTargets: string[] = [];

beforeAll(async () => {
  proxy = createServer();
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

const PROXY_ENV_CLEARED = {
  HTTPS_PROXY: "",
  https_proxy: "",
  HTTP_PROXY: "",
  http_proxy: "",
  NO_PROXY: "",
  no_proxy: "",
};

async function runProbe(
  envOverrides: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stderr: string }> {
  try {
    await execFileAsync("node", [scriptPath], {
      cwd: runtimePackageRoot,
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
