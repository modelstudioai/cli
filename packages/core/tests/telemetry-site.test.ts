import { expect, test } from "vite-plus/test";
import { classifyModelHost, hostnameOf } from "../src/config/model-endpoints.ts";
import { resolveTelemetrySite, telemetryRemoteTarget } from "../src/telemetry/site.ts";

test.each([
  ["https://dashscope.aliyuncs.com", "dashscope.aliyuncs.com"],
  ["dashscope-intl.aliyuncs.com", "dashscope-intl.aliyuncs.com"],
  ["  https://CN-HongKong.dashscope.aliyuncs.com/path  ", "cn-hongkong.dashscope.aliyuncs.com"],
  ["", undefined],
  [undefined, undefined],
])("hostnameOf(%j) → %j", (input, expected) => {
  expect(hostnameOf(input)).toBe(expected);
});

test.each([
  ["dashscope.aliyuncs.com", "domestic"],
  ["https://dashscope.aliyuncs.com/api/v1", "domestic"],
  ["token-plan.cn-beijing.maas.aliyuncs.com", "domestic"],
  ["ws-abc.cn-beijing.maas.aliyuncs.com", "domestic"],
  ["dashscope-intl.aliyuncs.com", "international"],
  ["dashscope-us.aliyuncs.com", "international"],
  ["cn-hongkong.dashscope.aliyuncs.com", "international"],
  ["token-plan.ap-southeast-1.maas.aliyuncs.com", "international"],
  ["ws-abc.ap-southeast-1.maas.aliyuncs.com", "international"],
  ["ws-abc.cn-hongkong.maas.aliyuncs.com", "international"],
  ["ws-abc.eu-central-1.maas.aliyuncs.com", "international"],
  ["ws-abc.us-east-1.maas.aliyuncs.com", "international"],
  ["ws-abc.ap-northeast-1.maas.aliyuncs.com", "international"],
  ["custom.proxy.example.com", "unknown"],
  ["token-plan.unknown-region.maas.aliyuncs.com", "unknown"],
  [undefined, "unknown"],
  ["", "unknown"],
])("classifyModelHost(%j) → %j", (host, expected) => {
  expect(classifyModelHost(host)).toBe(expected);
});

test("console auth uses consoleSite only (D4=B)", () => {
  expect(
    resolveTelemetrySite({
      auth: "console",
      consoleSite: "international",
      baseUrl: "https://dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });

  expect(
    resolveTelemetrySite({
      auth: "console",
      consoleSite: "domestic",
      baseUrl: "https://dashscope-intl.aliyuncs.com",
    }),
  ).toEqual({ site: "domestic", siteReason: "default-fallback" });

  expect(
    resolveTelemetrySite({
      auth: "console",
      baseUrl: "https://dashscope-intl.aliyuncs.com",
    }),
  ).toEqual({ site: "domestic", siteReason: "default-fallback" });
});

test("apiKey prefers lastResolvedOrigin over baseUrl", () => {
  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      lastResolvedOrigin: "https://ws.ap-southeast-1.maas.aliyuncs.com",
      baseUrl: "https://dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });

  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      baseUrl: "https://dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "domestic", siteReason: "positive-domestic" });
});

test("openapi classifies model-domain baseUrl, not ACS hosts", () => {
  expect(
    resolveTelemetrySite({
      auth: "openapi",
      baseUrl: "https://dashscope-intl.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });

  // ACS hosts must not be passed as baseUrl; if they were, they fall back as unknown→domestic
  expect(
    resolveTelemetrySite({
      auth: "openapi",
      baseUrl: "https://modelstudio.ap-southeast-1.aliyuncs.com",
    }),
  ).toEqual({ site: "domestic", siteReason: "unknown-host" });
});

test("cn-hongkong is international", () => {
  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      baseUrl: "https://cn-hongkong.dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });
});

test("unknown host falls back to domestic with unknown-host reason", () => {
  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      baseUrl: "https://my-reverse-proxy.example.com",
    }),
  ).toEqual({ site: "domestic", siteReason: "unknown-host" });
});

test("auth none ORs consoleSite with model host", () => {
  expect(
    resolveTelemetrySite({
      auth: "none",
      consoleSite: "international",
      baseUrl: "https://dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });

  expect(
    resolveTelemetrySite({
      auth: "none",
      consoleSite: "domestic",
      baseUrl: "https://dashscope-intl.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });

  expect(
    resolveTelemetrySite({
      auth: "none",
      lastResolvedOrigin: "https://ws.ap-southeast-1.maas.aliyuncs.com",
      baseUrl: "https://dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });

  expect(
    resolveTelemetrySite({
      auth: "none",
      baseUrl: "https://dashscope.aliyuncs.com",
    }),
  ).toEqual({ site: "domestic", siteReason: "positive-domestic" });
});

test("mixed profile: console domestic does not force apiKey domestic", () => {
  expect(
    resolveTelemetrySite({
      auth: "apiKey",
      consoleSite: "domestic",
      baseUrl: "https://dashscope-intl.aliyuncs.com",
    }),
  ).toEqual({ site: "international", siteReason: "positive-international" });
});

test("missing baseUrl defaults domestic", () => {
  expect(resolveTelemetrySite({ auth: "apiKey" })).toEqual({
    site: "domestic",
    siteReason: "default-fallback",
  });
});

test("telemetryRemoteTarget maps site to endpoint and pid", () => {
  expect(telemetryRemoteTarget("domestic")).toEqual({
    site: "domestic",
    endpoint: "gm.mmstat.com",
    pid: "bailian-cli-node",
  });
  expect(telemetryRemoteTarget("international")).toEqual({
    site: "international",
    endpoint: "sg.mmstat.com",
    pid: "bailian-cli-node-intl",
  });
});
