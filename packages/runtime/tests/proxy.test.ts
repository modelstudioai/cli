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
  const r = readProxyEnv({ NO_PROXY: "*.aliyuncs.com" });
  expect(r.noProxy).toBe("*.aliyuncs.com");
  expect(r.httpProxy).toBeUndefined();
  expect(r.httpsProxy).toBeUndefined();
});
