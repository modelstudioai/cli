import { expect, test } from "vite-plus/test";
import { Client } from "../src/client/client.ts";
import type { Identity, Settings } from "../src/config/schema.ts";

const identity: Identity = {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli-test",
  npmPackage: "bailian-cli",
};

const settings = { telemetry: true, timeout: 30 } as Settings;

test("url records lastResolvedOrigin for defaultBaseUrl callbacks", () => {
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://dashscope.aliyuncs.com",
    baseUrlIsDefault: true,
    apiCred: {
      token: "sk-test",
      baseUrl: "https://dashscope.aliyuncs.com",
      source: "config",
    },
  });
  expect(client.lastResolvedOrigin).toBeUndefined();
  expect(client.url("/decision", () => "https://ws.ap-southeast-1.maas.aliyuncs.com")).toBe(
    "https://ws.ap-southeast-1.maas.aliyuncs.com/decision",
  );
  expect(client.lastResolvedOrigin).toBe("https://ws.ap-southeast-1.maas.aliyuncs.com");
});

test("configured baseUrl wins over callback and is still recorded", () => {
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://dashscope-intl.aliyuncs.com",
    baseUrlIsDefault: false,
    apiCred: {
      token: "sk-test",
      baseUrl: "https://dashscope-intl.aliyuncs.com",
      source: "config",
    },
  });
  expect(client.url("/service", () => "https://ws.ap-southeast-1.maas.aliyuncs.com")).toBe(
    "https://dashscope-intl.aliyuncs.com/service",
  );
  expect(client.lastResolvedOrigin).toBe("https://dashscope-intl.aliyuncs.com");
});

test("empty managed-agent callback does not record an origin", () => {
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://dashscope.aliyuncs.com",
    baseUrlIsDefault: true,
    apiCred: {
      token: "sk-test",
      baseUrl: "https://dashscope.aliyuncs.com",
      source: "config",
    },
  });
  expect(client.url("", () => "")).toBe("");
  expect(client.lastResolvedOrigin).toBeUndefined();
});

test("uploadFile path records origin via url()", async () => {
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://dashscope.aliyuncs.com",
    baseUrlIsDefault: true,
    apiCred: {
      token: "sk-test",
      baseUrl: "https://dashscope.aliyuncs.com",
      source: "config",
    },
  });
  // Non-local source short-circuits before upload but still goes through url when local.
  // Calling url directly mirrors uploadFile's baseUrl resolution.
  client.url("", () => "https://ws.cn-hongkong.maas.aliyuncs.com");
  expect(client.lastResolvedOrigin).toBe("https://ws.cn-hongkong.maas.aliyuncs.com");
});
