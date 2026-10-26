import http from "node:http";
import { Readable } from "node:stream";
import { expect, test, vi } from "vite-plus/test";
import { ExitCode, type AuthStore, type Identity, type Settings } from "bailian-cli-core";

const openInBrowser = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>());

vi.mock("../src/commands/shared/local-server.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/shared/local-server.ts")>();
  return {
    ...actual,
    openInBrowser: (url: string) => openInBrowser(url),
  };
});

import {
  runConsoleLogin,
  runConsoleTokenLogin,
  type LoginDeps,
} from "../src/commands/auth/login-console.ts";

function callbackTarget(loginUrl: string): { port: number; state: string } {
  const notice = new URL(loginUrl).searchParams.get("notice");
  if (!notice) throw new Error("login URL is missing notice");
  const callback = new URL(`http://${notice}`);
  const state = callback.searchParams.get("state");
  if (!callback.port || !state) throw new Error("login URL is missing callback state");
  return { port: Number(callback.port), state };
}

function postCallback(port: number, state: string, body: Record<string, string>): Promise<number> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `/?state=${encodeURIComponent(state)}`,
        method: "POST",
        agent: false,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          connection: "close",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    request.end(payload);
  });
}

test("控制台回调只有会话、没有 API Key 时提示模型命令仍不可用", async () => {
  const stderr: string[] = [];
  const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  const saved: unknown[] = [];
  let loginUrl = "";
  openInBrowser.mockReset();
  openInBrowser.mockImplementation(async (url) => {
    loginUrl = url;
  });

  const pending = runConsoleLogin(
    "https://bailian.console.aliyun.com",
    {
      identity: { binName: "bl" } as Identity,
      settings: {} as Settings,
      authStore: {
        path: "/tmp/bailian/config.json",
        login: async (patch: unknown) => {
          saved.push(patch);
        },
      } as unknown as AuthStore,
      localize: (text) => (typeof text === "string" ? text : text["zh-CN"]),
    },
    { needApiKey: true },
  );

  try {
    await vi.waitFor(() => {
      if (!loginUrl) throw new Error("waiting for login URL");
    });
    expect(loginUrl).toContain("&needapikey=true");
    const target = callbackTarget(loginUrl);
    const status = await postCallback(target.port, target.state, {
      access_token: "console-token",
      console_region: "cn-beijing",
      console_site: "domestic",
    });
    expect(status).toBe(200);
    await pending;
  } finally {
    write.mockRestore();
  }

  expect(saved).toEqual([
    expect.objectContaining({
      access_token: "console-token",
      console_region: "cn-beijing",
      console_site: "domestic",
    }),
  ]);
  expect(stderr.join("")).toContain("仅保存了控制台会话");
  expect(stderr.join("")).toContain("bl auth login --api-key <key>");
  expect(stderr.join("")).not.toContain("console-token");
});

async function startLoginProbe(
  options: { noBrowser?: boolean } = {},
  browser: "normal" | "failed" | "fast" | "pending" = "normal",
) {
  const output: string[] = [];
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  const save = vi.fn<(patch: unknown) => Promise<void>>().mockResolvedValue(undefined);
  let openedUrl = "";
  let settled = false;
  openInBrowser.mockReset();
  openInBrowser.mockImplementation(async (url) => {
    openedUrl = url;
    if (browser === "failed") throw new Error("browser unavailable");
    if (browser === "fast") {
      const target = callbackTarget(url);
      await postCallback(target.port, target.state, { access_token: "fast-token" });
    }
    if (browser === "pending") await new Promise(() => {});
  });
  const pending = runConsoleLogin(
    "https://modelstudio.console.alibabacloud.com",
    {
      identity: { binName: "bl" } as Identity,
      settings: {} as Settings,
      authStore: { path: "/unused/config.json", login: save } as unknown as AuthStore,
      localize: (text) => (typeof text === "string" ? text : text["zh-CN"]),
    },
    options,
  ).then(
    () => {
      settled = true;
      return undefined;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  const getUrl = () =>
    openedUrl || output.join("").match(/https:\/\/\S+\/console-login\?\S+/)?.[0] || "";
  await vi.waitFor(() => expect(getUrl()).not.toBe(""));
  const target = callbackTarget(getUrl());
  const callbackUrl = `http://127.0.0.1:${target.port}/?state=${target.state}`;
  return {
    output,
    save,
    pending,
    callbackUrl,
    async cleanup() {
      if (!settled) {
        await postCallback(target.port, target.state, { access_token: "cleanup-token" }).catch(
          () => {},
        );
      }
      await pending;
      stderr.mockRestore();
    },
  };
}

const INTERNATIONAL_ORIGIN = "https://modelstudio.console.alibabacloud.com";

test("回调只允许登录站点的 Origin，按需响应 PNA，并保留 state 校验", async () => {
  const probe = await startLoginProbe();
  try {
    const preflight = await fetch(probe.callbackUrl, {
      method: "OPTIONS",
      headers: {
        Origin: INTERNATIONAL_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(INTERNATIONAL_ORIGIN);
    expect(preflight.headers.get("access-control-allow-private-network")).toBe("true");
    expect(preflight.headers.get("vary")).toContain("Origin");
    const ordinary = await fetch(probe.callbackUrl, {
      method: "OPTIONS",
      headers: { Origin: INTERNATIONAL_ORIGIN },
    });
    expect(ordinary.headers.has("access-control-allow-private-network")).toBe(false);
    for (const method of ["OPTIONS", "POST"]) {
      const rejected = await fetch(probe.callbackUrl, {
        method,
        headers: { Origin: "https://untrusted.example" },
        ...(method === "POST" ? { body: JSON.stringify({ access_token: "forged-token" }) } : {}),
      });
      expect(rejected.status).toBe(403);
      expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
    }
    const badState = await fetch(probe.callbackUrl.replace(/state=.*/, "state=wrong"), {
      method: "POST",
      headers: { Origin: INTERNATIONAL_ORIGIN },
      body: JSON.stringify({ access_token: "forged-token" }),
    });
    expect(badState.status).toBe(400);
    expect(badState.headers.get("access-control-allow-origin")).toBe(INTERNATIONAL_ORIGIN);
    const noCredential = await fetch(probe.callbackUrl, {
      method: "POST",
      body: JSON.stringify({ console_site: "international" }),
    });
    expect(noCredential.status).toBe(400);
    expect(probe.save).not.toHaveBeenCalled();
    const valid = await fetch(probe.callbackUrl, {
      method: "POST",
      headers: { Origin: INTERNATIONAL_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: "valid-token", console_site: "international" }),
    });
    expect(valid.status).toBe(200);
    expect(valid.headers.get("access-control-allow-origin")).toBe(INTERNATIONAL_ORIGIN);
    expect(await probe.pending).toBeUndefined();
    expect(probe.save).toHaveBeenCalledTimes(1);
    expect(probe.output.join("")).not.toContain("valid-token");
    expect(probe.output.join("")).toContain("/console-login?notice=");
  } finally {
    await probe.cleanup();
  }
});

test("--no-browser 打印登录地址但不启动浏览器，仍接受回调", async () => {
  const probe = await startLoginProbe({ noBrowser: true });
  try {
    expect(openInBrowser).not.toHaveBeenCalled();
    expect(probe.output.join("")).toContain("/console-login?notice=");
    const response = await fetch(probe.callbackUrl, {
      method: "POST",
      body: JSON.stringify({ access_token: "manual-browser-token" }),
    });
    expect(response.status).toBe(200);
    expect(await probe.pending).toBeUndefined();
  } finally {
    await probe.cleanup();
  }
});

test("没有回调时超时失败，不写凭证，并关闭监听端口", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const probe = await startLoginProbe({ noBrowser: true });
  try {
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(await probe.pending).toMatchObject({ exitCode: ExitCode.TIMEOUT });
    expect(probe.save).not.toHaveBeenCalled();
    await expect(fetch(probe.callbackUrl)).rejects.toThrow();
  } finally {
    vi.useRealTimers();
    await probe.cleanup();
  }
});

test("保存失败向可信页面返回可读错误，登录失败且不泄漏凭证", async () => {
  const probe = await startLoginProbe();
  const failure = new Error("disk unavailable");
  probe.save.mockRejectedValue(failure);
  try {
    const response = await fetch(probe.callbackUrl, {
      method: "POST",
      headers: { Origin: INTERNATIONAL_ORIGIN },
      body: JSON.stringify({ access_token: "failed-token" }),
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("access-control-allow-origin")).toBe(INTERNATIONAL_ORIGIN);
    expect(await probe.pending).toBe(failure);
    expect(probe.output.join("")).not.toContain("failed-token");
  } finally {
    await probe.cleanup();
  }
});

test("回调在保存期间断开，保存结束后登录仍能完成并关闭端口", async () => {
  // 保留真实 HTTP 服务；只记录实例以在回归失败时清理监听资源。
  const servers = vi.spyOn(http, "createServer");
  const probe = await startLoginProbe();
  const server = servers.mock.results[0]!.value as http.Server;
  let finishSave!: () => void;
  const saving = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  probe.save.mockImplementation(() => saving);
  const disconnected = new Promise<void>((resolve) => {
    server.once("connection", (socket) => socket.once("close", resolve));
  });
  const request = http.request(probe.callbackUrl, { method: "POST", agent: false });
  request.on("error", () => {});
  request.end(JSON.stringify({ access_token: "disconnected-token" }));
  let completed = false;
  void probe.pending.then(() => {
    completed = true;
  });
  try {
    await vi.waitFor(() => expect(probe.save).toHaveBeenCalledTimes(1));
    request.destroy();
    await disconnected;
    finishSave();
    await vi.waitFor(() => expect(completed).toBe(true));
    expect(await probe.pending).toBeUndefined();
    await expect(fetch(probe.callbackUrl)).rejects.toThrow();
  } finally {
    finishSave();
    request.destroy();
    server.close();
    server.closeAllConnections();
    await probe.cleanup();
    servers.mockRestore();
  }
});

test.each(["failed", "fast", "pending"] as const)(
  "浏览器 %s 不阻止收到回调后完成登录",
  async (browser) => {
    const probe = await startLoginProbe({}, browser);
    try {
      expect(probe.output.join("")).toContain("/console-login?notice=");
      if (browser !== "fast") {
        const response = await fetch(probe.callbackUrl, {
          method: "POST",
          body: JSON.stringify({ access_token: "browser-token" }),
        });
        expect(response.status).toBe(200);
      }
      expect(await probe.pending).toBeUndefined();
      expect(probe.save).toHaveBeenCalledTimes(1);
    } finally {
      await probe.cleanup();
    }
  },
);

test.each(["tty", "json", "bearer", "multiple"])(
  "stdin 拒绝 %s 输入，不读取交互凭证或调用远端",
  async (kind) => {
    const input = Readable.from([
      kind === "json"
        ? '{"access_token":"secret"}'
        : kind === "bearer"
          ? "Bearer secret"
          : "first\nsecond",
    ]);
    Object.defineProperty(input, "isTTY", { configurable: true, value: kind === "tty" });
    const stdin = vi.spyOn(process, "stdin", "get").mockReturnValue(input as typeof process.stdin);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        runConsoleTokenLogin({} as LoginDeps, {
          site: "international",
          region: "ap-southeast-1",
        }),
      ).rejects.toMatchObject({ exitCode: ExitCode.USAGE });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      stdin.mockRestore();
      fetchSpy.mockRestore();
      input.destroy();
    }
  },
);
