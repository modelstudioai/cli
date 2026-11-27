import { buildSettings, type AuthStore, type Identity, type LocalizedText } from "bailian-cli-core";
import { expect, test, vi } from "vite-plus/test";

// 换票与控制台校验是这条链路仅有的两处网络出口。mock 掉它们，才能把断言集中在
// 「用户传的 --console-site 最终落到了哪里」，而不是依赖真实 AK/SK。
type ConsoleSite = "domestic" | "international";
type TokenRequest = { settings: { consoleSite?: ConsoleSite }; baseUrl: string };
type GatewayTarget = { region: string; site: ConsoleSite; token: string };

const generateCLIAccessToken = vi.hoisted(() =>
  vi.fn<(request: TokenRequest) => Promise<{ cliAccessToken: string }>>(async () => ({
    cliAccessToken: "cli-token-fake",
  })),
);
const validateConsoleAccessToken = vi.hoisted(() =>
  vi.fn<(target: GatewayTarget, settings: unknown, diagnostics: unknown) => Promise<void>>(
    async () => undefined,
  ),
);

vi.mock("bailian-cli-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bailian-cli-core")>();
  return {
    ...actual,
    generateCLIAccessToken: (request: TokenRequest) => generateCLIAccessToken(request),
    validateConsoleAccessToken: (target: GatewayTarget, settings: unknown, diagnostics: unknown) =>
      validateConsoleAccessToken(target, settings, diagnostics),
  };
});

import login from "../src/commands/auth/login.ts";

const identity: Identity = {
  binName: "bl",
  version: "test",
  npmPackage: "bailian-cli",
  clientName: "bailian-cli-test",
};

interface Harness {
  savedPatch: Record<string, unknown>;
  gatewayTarget: GatewayTarget | undefined;
}

/**
 * `--console-site` 是命令自有 flag：create-cli 只把全局 flag 与凭证域 flag 放进
 * sources，所以它永远进不了 `settings`。落盘链路必须自己尊重 `ctx.flags`，
 * 否则会出现「新 Profile 传 international 存成 domestic」这类静默忽略。
 */
async function runPersist(
  flagSite: ConsoleSite | undefined,
  settingsSite: ConsoleSite | undefined,
): Promise<Harness> {
  generateCLIAccessToken.mockClear();
  validateConsoleAccessToken.mockClear();
  const savedPatch: Record<string, unknown> = {};

  const store = {
    path: "/tmp/unused/config.json",
    resolveBaseUrl: () => "https://dashscope.aliyuncs.com/compatible-mode/v1",
    stored: () => ({}),
    async login(patch: Record<string, unknown>) {
      Object.assign(savedPatch, patch);
    },
  } as unknown as AuthStore;

  const settings = {
    ...buildSettings({ flags: {}, file: {}, env: {} }),
    consoleSite: settingsSite,
  };
  const flags = {
    openApi: true,
    accessKeyId: "LTAI-fake",
    accessKeySecret: "secret-fake",
    ...(flagSite === undefined ? {} : { consoleSite: flagSite }),
  };

  await login.run({
    identity,
    settings,
    flags,
    authStore: store,
    localize: (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
    output: {
      info: () => undefined,
      warning: () => undefined,
      progress: () => undefined,
      result: () => undefined,
      debug: () => undefined,
    },
  } as never);

  return { savedPatch, gatewayTarget: validateConsoleAccessToken.mock.calls[0]?.[0] };
}

test("显式 --console-site international 落到新 Profile（settings 里什么都没有）", async () => {
  const { savedPatch, gatewayTarget } = await runPersist("international", undefined);
  expect(savedPatch.console_site).toBe("international");
  expect(gatewayTarget?.site).toBe("international");
});

test("显式 --console-site domestic 覆盖 Profile 里已存的 international", async () => {
  const { savedPatch, gatewayTarget } = await runPersist("domestic", "international");
  expect(savedPatch.console_site).toBe("domestic");
  expect(gatewayTarget?.site).toBe("domestic");
});

test("不传 --console-site 时仍沿用 Profile 默认", async () => {
  const { savedPatch, gatewayTarget } = await runPersist(undefined, "international");
  expect(savedPatch.console_site).toBe("international");
  expect(gatewayTarget?.site).toBe("international");
});

test("换票请求也使用被覆盖后的站点（generateCLIAccessToken 内部会重算 target）", async () => {
  await runPersist("domestic", "international");
  const request = generateCLIAccessToken.mock.calls[0]?.[0];
  expect(request?.settings.consoleSite).toBe("domestic");
});
