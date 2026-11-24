import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { FIRST_INSTALL_REPORT_ARGUMENT } from "bailian-cli-core";
import { EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { createCli } from "../src/create-cli.ts";
import { readProxyEnv } from "../src/proxy.ts";

test("readProxyEnv: 未设置任何代理变量时全部为 undefined", () => {
  expect(readProxyEnv({})).toEqual({
    httpProxy: undefined,
    httpsProxy: undefined,
    noProxy: undefined,
  });
});

test("readProxyEnv: 空白值视为未设置", () => {
  expect(readProxyEnv({ HTTPS_PROXY: "", HTTP_PROXY: "   ", NO_PROXY: "" })).toEqual({
    httpProxy: undefined,
    httpsProxy: undefined,
    noProxy: undefined,
  });
});

test("readProxyEnv: 读取代理变量", () => {
  expect(
    readProxyEnv({
      HTTP_PROXY: "http://proxy.example.com:8080",
      HTTPS_PROXY: "http://secure-proxy.example.com:8080",
    }),
  ).toEqual({
    httpProxy: "http://proxy.example.com:8080",
    httpsProxy: "http://secure-proxy.example.com:8080",
    noProxy: undefined,
  });
});

test("readProxyEnv: NO_PROXY 独立读取", () => {
  const result = readProxyEnv({ NO_PROXY: "*.aliyuncs.com" });
  expect(result.noProxy).toBe("*.aliyuncs.com");
  expect(result.httpProxy).toBeUndefined();
  expect(result.httpsProxy).toBeUndefined();
});

test("readProxyEnv: 小写变量兜底（macOS/Linux 习惯）", () => {
  expect(
    readProxyEnv({
      https_proxy: "http://127.0.0.1:7890",
      http_proxy: "http://127.0.0.1:7891",
      no_proxy: "localhost",
    }),
  ).toEqual({
    httpProxy: "http://127.0.0.1:7891",
    httpsProxy: "http://127.0.0.1:7890",
    noProxy: "localhost",
  });
});

test("first-install launch installs the proxy and ignores an invalid proxy", async () => {
  const previousDispatcher = getGlobalDispatcher();
  const configDir = mkdtempSync(join(tmpdir(), "bl-first-install-proxy-"));
  const savedConfigDir = process.env.BAILIAN_CONFIG_DIR;
  const savedHttpsProxy = process.env.HTTPS_PROXY;
  const savedHttpProxy = process.env.HTTP_PROXY;
  const savedHttpsProxyLower = process.env.https_proxy;
  const savedHttpProxyLower = process.env.http_proxy;
  const savedReport = process.env.BAILIAN_FIRST_INSTALL_REPORT;
  const launch = () =>
    createCli(
      {},
      {
        binName: "bl",
        version: "0.0.0-test",
        clientName: "bailian-cli",
        npmPackage: "bailian-cli",
      },
    ).run([FIRST_INSTALL_REPORT_ARGUMENT]);
  try {
    process.env.BAILIAN_CONFIG_DIR = configDir;
    process.env.BAILIAN_FIRST_INSTALL_REPORT = "1";
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    process.env.HTTPS_PROXY = "http://127.0.0.1:9";

    await launch();
    expect(getGlobalDispatcher()).toBeInstanceOf(EnvHttpProxyAgent);

    process.env.HTTPS_PROXY = "::::not-a-url";
    await expect(launch()).resolves.toBeUndefined();
  } finally {
    setGlobalDispatcher(previousDispatcher);
    if (savedConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = savedConfigDir;
    if (savedHttpsProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = savedHttpsProxy;
    if (savedHttpProxy === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = savedHttpProxy;
    if (savedHttpsProxyLower === undefined) delete process.env.https_proxy;
    else process.env.https_proxy = savedHttpsProxyLower;
    if (savedHttpProxyLower === undefined) delete process.env.http_proxy;
    else process.env.http_proxy = savedHttpProxyLower;
    if (savedReport === undefined) delete process.env.BAILIAN_FIRST_INSTALL_REPORT;
    else process.env.BAILIAN_FIRST_INSTALL_REPORT = savedReport;
    rmSync(configDir, { recursive: true, force: true });
  }
});

test("readProxyEnv: 大写优先于小写", () => {
  const result = readProxyEnv({
    HTTPS_PROXY: "http://upper.example.com:8080",
    https_proxy: "http://lower.example.com:8080",
  });
  expect(result.httpsProxy).toBe("http://upper.example.com:8080");
});
