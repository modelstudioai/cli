import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  isSandboxNetworkDenialCode,
  networkCauseCode,
  probeTcpHost,
  runtimeDownloadFailure,
  BailianError,
  ExitCode,
} from "../src/index.ts";

describe("networkCauseCode", () => {
  test("取直接 errno", () => {
    expect(networkCauseCode(Object.assign(new Error("x"), { code: "EPERM" }))).toBe("EPERM");
  });

  test("沿 cause 链取 undici 包装下的 errno", () => {
    const cause = Object.assign(new Error("connect EPERM 1.2.3.4:443"), { code: "EPERM" });
    const wrapped = new TypeError("fetch failed", { cause });
    expect(networkCauseCode(wrapped)).toBe("EPERM");
  });

  test("无 code 或非错误对象返回 undefined", () => {
    expect(networkCauseCode(new Error("plain"))).toBeUndefined();
    expect(networkCauseCode(undefined)).toBeUndefined();
    expect(networkCauseCode("string error")).toBeUndefined();
  });
});

describe("isSandboxNetworkDenialCode", () => {
  test("沙箱拒绝特征码为 true", () => {
    for (const code of ["EPERM", "EACCES", "ENETUNREACH", "EHOSTUNREACH"]) {
      expect(isSandboxNetworkDenialCode(code)).toBe(true);
    }
  });

  test("普通网络错误与 undefined 为 false（不误报沙箱）", () => {
    for (const code of ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", undefined]) {
      expect(isSandboxNetworkDenialCode(code)).toBe(false);
    }
  });
});

describe("runtimeDownloadFailure", () => {
  const url = "https://example.invalid/python.tar.gz";

  test("沙箱拒绝：message 带 errno，hint 追加放行网络/代理指引", () => {
    const cause = Object.assign(new Error("connect EPERM"), { code: "EPERM" });
    const error = runtimeDownloadFailure(url, new TypeError("fetch failed", { cause }));
    expect(error).toBeInstanceOf(BailianError);
    expect(error.exitCode).toBe(ExitCode.NETWORK);
    expect(error.message).toContain("(EPERM)");
    expect(error.hint).toContain("BAILIAN_RL_PYTHON_MIRROR");
    expect(error.hint).toContain("agent sandbox");
    expect(error.hint).toContain("HTTPS_PROXY");
  });

  test("普通网络失败：保留镜像指引，不追加沙箱指引", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    const error = runtimeDownloadFailure(url, new TypeError("fetch failed", { cause }));
    expect(error.message).toContain("(ENOTFOUND)");
    expect(error.hint).toContain("BAILIAN_RL_PYTHON_MIRROR");
    expect(error.hint).not.toContain("agent sandbox");
  });

  test("无 errno 时 message 不携带空括号", () => {
    const error = runtimeDownloadFailure(url, new Error("boom"));
    expect(error.message).toBe(`Failed to download runtime artifact from ${url}.`);
  });
});

describe("probeTcpHost（回环，不真实出站）", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  test("可达端口返回 undefined，关闭后的端口返回 ECONNREFUSED", async () => {
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server!.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    expect(port).toBeGreaterThan(0);

    expect(await probeTcpHost("127.0.0.1", port, 2_000)).toBeUndefined();

    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    expect(await probeTcpHost("127.0.0.1", port, 2_000)).toBe("ECONNREFUSED");
  });
});
