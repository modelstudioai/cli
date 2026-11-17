import { describe, expect, test, vi } from "vite-plus/test";
import { RL_AUTH_API, extractEnabledFlag, runRlAuthorization } from "../src/index.ts";

const READY = { data: { enabled: true } };
const MISSING = { data: { enabled: false } };

const MUTATION_APIS: string[] = [
  RL_AUTH_API.createFineTuningSlr,
  RL_AUTH_API.createTelemetrySlr,
  RL_AUTH_API.enableReinforcement,
  RL_AUTH_API.enableOpd,
];

function consoleMock(
  overrides: Record<string, unknown> = {},
  failures: Record<string, Error> = {},
) {
  const calls: { api: string; data: Record<string, unknown> }[] = [];
  const caller = vi.fn(async (api: string, data: Record<string, unknown>) => {
    calls.push({ api, data });
    if (failures[api]) throw failures[api];
    if (api in overrides) return overrides[api];
    return READY;
  });
  return { caller, calls };
}

function apis(calls: { api: string }[]): string[] {
  return calls.map((call) => call.api);
}

function reqDTO(data: Record<string, unknown> | undefined): Record<string, unknown> {
  return (data?.reqDTO ?? {}) as Record<string, unknown>;
}

describe("rl authorization state machine", () => {
  test("read-only probe performs no mutations", async () => {
    const { caller, calls } = consoleMock();
    const report = await runRlAuthorization({ target: "rl", console: caller });
    expect(report.ok).toBe(true);
    expect(apis(calls).filter((api) => MUTATION_APIS.includes(api))).toHaveLength(0);
  });

  test("a failed query is UNKNOWN, never READY or MISSING", async () => {
    const { caller } = consoleMock(
      {},
      { [RL_AUTH_API.queryReinforcementEnabled]: new Error("gateway down") },
    );
    const report = await runRlAuthorization({ target: "rl", console: caller });
    const enabled = report.checks.find((check) => check.name === "business-enabled");
    expect(enabled?.status).toBe("UNKNOWN");
    expect(report.ok).toBe(false);
  });

  test("authorize enables RL only, never OPD", async () => {
    const { caller, calls } = consoleMock({ [RL_AUTH_API.queryReinforcementEnabled]: MISSING });
    await runRlAuthorization({ target: "rl", console: caller, authorize: true });
    expect(apis(calls)).toContain(RL_AUTH_API.enableReinforcement);
    expect(apis(calls)).not.toContain(RL_AUTH_API.enableOpd);
  });

  test("authorize enables OPD only, never RL", async () => {
    const { caller, calls } = consoleMock({ [RL_AUTH_API.queryOpdEnabled]: MISSING });
    await runRlAuthorization({ target: "opd", console: caller, authorize: true });
    expect(apis(calls)).toContain(RL_AUTH_API.enableOpd);
    expect(apis(calls)).not.toContain(RL_AUTH_API.enableReinforcement);
  });

  test("missing whitelist requires user action and blocks enablement", async () => {
    const { caller, calls } = consoleMock({
      [RL_AUTH_API.checkUserWhitelist]: MISSING,
      [RL_AUTH_API.queryReinforcementEnabled]: MISSING,
    });
    const report = await runRlAuthorization({ target: "rl", console: caller, authorize: true });
    const whitelist = report.checks.find((check) => check.name === "whitelist");
    expect(whitelist?.status).toBe("REQUIRES_USER_ACTION");
    expect(apis(calls)).not.toContain(RL_AUTH_API.enableReinforcement);
    expect(report.ok).toBe(false);
  });

  test("missing fine-tuning SLR is created only when authorized", async () => {
    const { caller, calls } = consoleMock({ [RL_AUTH_API.checkFineTuningSlrAuth]: MISSING });
    await runRlAuthorization({ target: "rl", console: caller, authorize: true });
    expect(apis(calls)).toContain(RL_AUTH_API.createFineTuningSlr);

    const readOnly = consoleMock({ [RL_AUTH_API.checkFineTuningSlrAuth]: MISSING });
    await runRlAuthorization({ target: "rl", console: readOnly.caller });
    expect(apis(readOnly.calls)).not.toContain(RL_AUTH_API.createFineTuningSlr);
  });

  test("AppTrace without a service interface requires user action (advisory)", async () => {
    const { caller } = consoleMock({ [RL_AUTH_API.getTelemetryServiceStatus]: MISSING });
    const report = await runRlAuthorization({ target: "rl", console: caller });
    const appTrace = report.checks.find((check) => check.name === "apptrace-service");
    expect(appTrace?.status).toBe("REQUIRES_USER_ACTION");
    expect(report.ok).toBe(true);
  });

  test("workspace id is forwarded to the telemetry reqDTO", async () => {
    const { caller, calls } = consoleMock();
    await runRlAuthorization({ target: "rl", console: caller, workspaceId: "ws-123" });
    const scoped = calls.find((call) => call.api === RL_AUTH_API.getTelemetrySlrStatus);
    expect(reqDTO(scoped?.data).workspaceId).toBe("ws-123");
  });

  test("request bodies match the console gateway contract", async () => {
    const { caller, calls } = consoleMock();
    await runRlAuthorization({ target: "rl", console: caller, workspaceId: "ws-1" });
    const bodyOf = (api: string) => calls.find((call) => call.api === api)?.data;
    expect(bodyOf(RL_AUTH_API.checkUserWhitelist)).toEqual({ reqDTO: { type: "agentic_rl" } });
    expect(bodyOf(RL_AUTH_API.checkFineTuningSlrAuth)).toEqual({ input: { role: "fine-tuning" } });
    expect(bodyOf(RL_AUTH_API.getTelemetrySlrStatus)).toEqual({
      reqDTO: { workspaceId: "ws-1", slrType: "Xtrace" },
    });
    expect(bodyOf(RL_AUTH_API.getTelemetryServiceStatus)).toEqual({
      reqDTO: { workspaceId: "ws-1", serviceType: "AppTrace" },
    });
    expect(bodyOf(RL_AUTH_API.queryReinforcementEnabled)).toEqual({ reqDTO: {} });
  });

  test("createFineTuningSlr sends the roles array under input", async () => {
    const { caller, calls } = consoleMock({ [RL_AUTH_API.checkFineTuningSlrAuth]: MISSING });
    await runRlAuthorization({ target: "rl", console: caller, authorize: true });
    const create = calls.find((call) => call.api === RL_AUTH_API.createFineTuningSlr);
    expect(create?.data).toEqual({ input: { roles: ["fine-tuning"] } });
  });

  test("telemetry result flag and AppTrace openStatus are parsed", async () => {
    const { caller } = consoleMock({
      [RL_AUTH_API.getTelemetrySlrStatus]: { data: { result: true } },
      [RL_AUTH_API.getTelemetryServiceStatus]: {
        data: { openStatus: true, instanceStatus: "Running" },
      },
    });
    const report = await runRlAuthorization({ target: "rl", console: caller });
    expect(report.checks.find((check) => check.name === "telemetry-slr")?.status).toBe("READY");
    expect(report.checks.find((check) => check.name === "apptrace-service")?.status).toBe("READY");
  });
});

describe("rl authorization SLS step", () => {
  test("SLS is a static manual advisory, never probed or opened", async () => {
    const { caller, calls } = consoleMock();
    const report = await runRlAuthorization({ target: "rl", console: caller, authorize: true });
    const sls = report.checks.find((check) => check.name === "sls-service");
    expect(sls?.status).toBe("REQUIRES_USER_ACTION");
    expect(sls?.required).toBe(false);
    expect(sls?.detail).toContain("SLS");
    // No SLS gateway call and no SLS mutation is ever attempted.
    expect(apis(calls).some((api) => api.toLowerCase().includes("sls"))).toBe(false);
    expect(report.actions.some((action) => action.toLowerCase().includes("sls"))).toBe(false);
    expect(report.ok).toBe(true);
  });

  test("SLS guidance defaults to en-US without a localize seam", async () => {
    const { caller } = consoleMock();
    const report = await runRlAuthorization({ target: "rl", console: caller });
    const sls = report.checks.find((check) => check.name === "sls-service");
    expect(sls?.detail).toContain("manually");
  });

  test("SLS guidance honors the localize seam (zh-CN)", async () => {
    const { caller } = consoleMock();
    const report = await runRlAuthorization({
      target: "rl",
      console: caller,
      localize: (text) => (typeof text === "string" ? text : text["zh-CN"]),
    });
    const sls = report.checks.find((check) => check.name === "sls-service");
    expect(sls?.detail).toContain("日志服务");
    expect(sls?.detail).toContain("控制台");
  });
});

describe("extractEnabledFlag", () => {
  test("reads common boolean flags under data or root", () => {
    expect(extractEnabledFlag({ data: { enabled: true } })).toBe(true);
    expect(extractEnabledFlag({ data: { authorized: false } })).toBe(false);
    expect(extractEnabledFlag({ whitelisted: true })).toBe(true);
    expect(extractEnabledFlag(true)).toBe(true);
    expect(extractEnabledFlag({ result: true })).toBe(true);
    expect(extractEnabledFlag({ openStatus: false })).toBe(false);
    expect(extractEnabledFlag({ data: { enabled: false, status: "NotExist" } })).toBe(false);
  });

  test("unrecognized shapes degrade to undefined", () => {
    expect(extractEnabledFlag({ data: { foo: 1 } })).toBeUndefined();
    expect(extractEnabledFlag(null)).toBeUndefined();
    expect(extractEnabledFlag("ready")).toBeUndefined();
  });
});
