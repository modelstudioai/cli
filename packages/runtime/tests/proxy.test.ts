import { expect, test } from "vite-plus/test";
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

test("readProxyEnv: 大写优先于小写", () => {
  const result = readProxyEnv({
    HTTPS_PROXY: "http://upper.example.com:8080",
    https_proxy: "http://lower.example.com:8080",
  });
  expect(result.httpsProxy).toBe("http://upper.example.com:8080");
});
