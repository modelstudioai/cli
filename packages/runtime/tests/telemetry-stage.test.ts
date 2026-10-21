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

function makeContext(): RunContext {
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
  };
  expect(deps.caller).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
    skillVersion: "2.5.0",
  });
  expect(deps.authMethod).toBe("none");
  expect(next).toHaveBeenCalledOnce();
});

test("defaults to human when caller env is unset", async () => {
  vi.stubEnv("BAILIAN_CALLER_TYPE", undefined);
  vi.stubEnv("BAILIAN_CALLER_NAME", undefined);
  vi.stubEnv("BAILIAN_SKILL_NAME", undefined);
  vi.stubEnv("BAILIAN_SKILL_VERSION", undefined);
  const next = vi.fn(async () => {});

  await telemetryStage(makeContext(), next);

  const deps = trackerMocks.trackCommandExecution.mock.calls[0]![0] as {
    caller: CallerAttribution;
  };
  expect(deps.caller).toEqual({ callerType: "human" });
});
