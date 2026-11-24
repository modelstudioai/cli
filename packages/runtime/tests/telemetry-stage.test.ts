import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { CallerAttribution } from "bailian-cli-core";

const trackerMocks = vi.hoisted(() => ({
  trackCommandExecution: vi.fn(
    async (
      _deps: unknown,
      _path: string[],
      _flags: Record<string, unknown>,
      next: () => Promise<void>,
    ) => {
      await next();
    },
  ),
}));

vi.mock("bailian-cli-core", async () => {
  const actual = await vi.importActual<typeof import("bailian-cli-core")>("bailian-cli-core");
  return {
    ...actual,
    trackCommandExecution: trackerMocks.trackCommandExecution,
  };
});

import { telemetryStage, type RunContext } from "../src/middleware.ts";

function makeContext(overrides: Record<string, unknown> = {}): RunContext {
  return {
    identity: {
      binName: "bl",
      version: "0.0.0-test",
      clientName: "bailian-cli-test",
      npmPackage: "bailian-cli",
    },
    path: ["config", "show"],
    command: { auth: "none" },
    settings: { telemetry: true },
    flags: {},
    ...overrides,
  } as RunContext;
}

beforeEach(() => {
  trackerMocks.trackCommandExecution.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("wires process.env through readCaller into trackCommandExecution", async () => {
  vi.stubEnv("BAILIAN_CALLER_TYPE", "agent");
  vi.stubEnv("BAILIAN_CALLER_NAME", "cursor");
  vi.stubEnv("BAILIAN_SKILL_NAME", "bailian-cli");
  vi.stubEnv("BAILIAN_SKILL_VERSION", "2.5.0");
  const next = vi.fn(async () => {});

  await telemetryStage(makeContext(), next);

  expect(trackerMocks.trackCommandExecution).toHaveBeenCalledOnce();
  const deps = trackerMocks.trackCommandExecution.mock.calls[0]![0] as {
    caller: CallerAttribution;
    authMethod: string;
    resolveSite?: () => { site: string; siteReason: string };
  };
  expect(deps.caller).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
    skillVersion: "2.5.0",
  });
  expect(deps.authMethod).toBe("none");
  expect(typeof deps.resolveSite).toBe("function");
  expect(next).toHaveBeenCalledOnce();
});

test("resolveSite uses client lastResolvedOrigin and settings.consoleSite", async () => {
  const next = vi.fn(async () => {});
  const context = makeContext({
    command: { auth: "apiKey" },
    client: {
      baseUrl: "https://dashscope.aliyuncs.com",
      lastResolvedOrigin: "https://ws.ap-southeast-1.maas.aliyuncs.com",
    },
    settings: { telemetry: true, consoleSite: "domestic" },
  });

  await telemetryStage(context, next);

  const deps = trackerMocks.trackCommandExecution.mock.calls[0]![0] as {
    resolveSite: () => { site: string; siteReason: string };
  };
  expect(deps.resolveSite()).toEqual({
    site: "international",
    siteReason: "positive-international",
  });
});

test("resolveSite for console auth ignores model baseUrl (D4=B)", async () => {
  const next = vi.fn(async () => {});
  const context = makeContext({
    command: { auth: "console" },
    client: {
      baseUrl: "https://dashscope-intl.aliyuncs.com",
      lastResolvedOrigin: undefined,
    },
    settings: {
      telemetry: true,
      consoleSite: "international",
    },
  });

  await telemetryStage(context, next);

  const deps = trackerMocks.trackCommandExecution.mock.calls[0]![0] as {
    resolveSite: () => { site: string; siteReason: string };
  };
  expect(deps.resolveSite()).toEqual({
    site: "international",
    siteReason: "positive-international",
  });
});

test("defaults to unknown when caller env is unset", async () => {
  vi.stubEnv("BAILIAN_CALLER_TYPE", undefined);
  vi.stubEnv("BAILIAN_CALLER_NAME", undefined);
  vi.stubEnv("BAILIAN_SKILL_NAME", undefined);
  vi.stubEnv("BAILIAN_SKILL_VERSION", undefined);
  const next = vi.fn(async () => {});

  await telemetryStage(makeContext(), next);

  const deps = trackerMocks.trackCommandExecution.mock.calls[0]![0] as {
    caller: CallerAttribution;
  };
  expect(deps.caller).toEqual({ callerType: "unknown" });
});

test("wires script caller env without skill fields", async () => {
  vi.stubEnv("BAILIAN_CALLER_TYPE", "script");
  vi.stubEnv("BAILIAN_CALLER_NAME", "cursor");
  vi.stubEnv("BAILIAN_SKILL_NAME", "bailian-cli");
  vi.stubEnv("BAILIAN_SKILL_VERSION", "2.5.0");
  const next = vi.fn(async () => {});

  await telemetryStage(makeContext(), next);

  const deps = trackerMocks.trackCommandExecution.mock.calls[0]![0] as {
    caller: CallerAttribution;
  };
  expect(deps.caller).toEqual({
    callerType: "script",
    callerName: "cursor",
  });
  expect(next).toHaveBeenCalledOnce();
});
