import http from "node:http";
import { expect, test, vi } from "vite-plus/test";
import type { AuthStore, Identity, Settings } from "bailian-cli-core";

const openInBrowser = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>());

vi.mock("../src/commands/shared/local-server.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/shared/local-server.ts")>();
  return {
    ...actual,
    openInBrowser: (url: string) => openInBrowser(url),
  };
});

import { runConsoleLogin } from "../src/commands/auth/login-console.ts";

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
