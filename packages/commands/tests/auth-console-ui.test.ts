import { expect, test } from "vite-plus/test";
import { makeAuthUiBridge } from "../src/commands/auth/console-ui.ts";
import type { AuthState, AuthStore, Identity, Settings } from "bailian-cli-core";

/** Build a bridge over a fake AuthStore. Only describe()/logout() are used by
 * the surface under test; startConsoleLogin() is intentionally not exercised
 * (it opens a browser and starts a real callback server). */
function bridgeWith(state: AuthState, onLogout?: (scope: string) => Promise<boolean>) {
  const authStore = {
    describe: () => state,
    stored: () => ({ apiKey: false, console: false, openapi: false }),
    resolveBaseUrl: () => "https://dashscope.aliyuncs.com",
    login: async () => {},
    logout: onLogout ?? (async () => false),
    path: "/tmp/config.json",
  } as unknown as AuthStore;
  return makeAuthUiBridge({
    identity: {} as unknown as Identity,
    settings: {} as unknown as Settings,
    authStore,
  });
}

test("status: console 凭证 -> primary=console，带 region/site 与掩码 token", () => {
  const st = bridgeWith({
    console: {
      token: "abcd1234efgh5678",
      region: "cn-beijing",
      site: "domestic",
      source: "config",
    },
  }).status();
  expect(st.authenticated).toBe(true);
  expect(st.primary).toBe("console");
  expect(st.methods).toEqual({ apiKey: false, console: true, openapi: false });
  expect(st.region).toBe("cn-beijing");
  expect(st.site).toBe("domestic");
  expect(st.masked).toContain("...");
  // Masked, never the raw token.
  expect(st.masked).not.toBe("abcd1234efgh5678");
});

test("status: 无任何凭证 -> 未认证，无 masked", () => {
  const st = bridgeWith({}).status();
  expect(st.authenticated).toBe(false);
  expect(st.primary).toBe(null);
  expect(st.masked).toBeUndefined();
  expect(st.methods).toEqual({ apiKey: false, console: false, openapi: false });
});

test("status: 仅 apiKey -> primary=apiKey", () => {
  const st = bridgeWith({
    apiKey: { token: "sk-1234567890", baseUrl: "https://dashscope.aliyuncs.com", source: "env" },
  }).status();
  expect(st.primary).toBe("apiKey");
  expect(st.methods.apiKey).toBe(true);
  expect(st.region).toBeUndefined();
});

test("logout 委托给 authStore.logout('all')", async () => {
  let scope = "";
  const bridge = bridgeWith(
    { apiKey: { token: "sk-x", baseUrl: "https://x", source: "config" } },
    async (s) => {
      scope = s;
      return true;
    },
  );
  expect(await bridge.logout()).toBe(true);
  expect(scope).toBe("all");
});
