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

test("readProxyEnv: 大小写变量均可识别，小写优先", () => {
  expect(readProxyEnv({ HTTPS_PROXY: "http://upper:1" }).httpsProxy).toBe("http://upper:1");
  expect(readProxyEnv({ https_proxy: "http://lower:1" }).httpsProxy).toBe("http://lower:1");
  expect(
    readProxyEnv({ https_proxy: "http://lower:1", HTTPS_PROXY: "http://upper:1" }).httpsProxy,
  ).toBe("http://lower:1");
});

test("readProxyEnv: 空字符串小写变量不屏蔽已设置的大写变量", () => {
  expect(readProxyEnv({ https_proxy: "", HTTPS_PROXY: "http://upper:1" }).httpsProxy).toBe(
    "http://upper:1",
  );
  expect(readProxyEnv({ http_proxy: "", HTTP_PROXY: "http://upper:2" }).httpProxy).toBe(
    "http://upper:2",
  );
});

test("readProxyEnv: NO_PROXY 独立读取", () => {
  const r = readProxyEnv({ NO_PROXY: "*.aliyuncs.com" });
  expect(r.noProxy).toBe("*.aliyuncs.com");
  expect(r.httpProxy).toBeUndefined();
  expect(r.httpsProxy).toBeUndefined();
});
