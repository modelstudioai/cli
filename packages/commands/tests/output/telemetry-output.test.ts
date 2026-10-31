import { stripVTControlCharacters } from "node:util";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  buildSettings,
  httpTransport,
  ExitCode,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "bailian-cli-commands";

const range = { startTime: "2026-01-02T03:04:00", endTime: "2026-01-02T04:04:00" };
const period = { start: "2026-01-02 03:04:00", end: "2026-01-02 04:04:00" };
const timestamp = new Date("2026-01-02T03:04:00").getTime();
const requestId = "11111111-2222-3333-4444-555555555555";
const service = {
  openStatus: true,
  instanceStatus: "Ready",
  instanceInfo: { instanceId: "instance-test", instanceUrl: "https://example.com/instance" },
};
const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
const mappedAgent = 87654321;
const entry = {
  workspaceId: "ws-test",
  modelRequestId: requestId,
  model: "qwen-test",
  startTime: timestamp,
  httpStatusCode: 200,
  callDuration: 20,
  firstTokenDuration: 5,
  usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
  originLog: { audit: "raw" },
  taskUuid: "task-test",
};
const trace = {
  traceId: "trace-test",
  spanId: "span-test",
  spanName: "Root span",
  startTime: timestamp,
  statusCode: "1",
  children: [
    {
      traceId: "trace-test",
      spanId: "child",
      spanName: "Child span",
      startTime: timestamp,
      statusCode: "2",
      statusMessage: "Trace error",
    },
  ],
};
const model = { model: "qwen-test", callCount: 10, callFailedCount: 2, avgCallDuration: 20 };
const series = [
  { metricName: "model_call_failed_count", aggMethod: "sum", points: [{ timestamp, value: 2 }] },
];
const errorRows = [{ httpStatusCode: "429", errorCode: "Limit", callCount: 2, callPercent: 0.2 }];
const traceStats = { resourceId: "qwen-test", callCount: 10, totalTokens: 5, avgDuration: 20 };
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  payload?: unknown;
  want: unknown;
  text: string;
  noDryRun?: boolean;
}
const cases: Scenario[] = [
  {
    name: "monitor overview",
    command: commands.monitorOverview,
    flags: { ...range },
    payload: model,
    want: { period, ...model },
    text: "Total Calls",
  },
  {
    name: "monitor models",
    command: commands.monitorModels,
    flags: { ...range, nextToken: "cursor-in" },
    payload: { list: [model], totalCount: 9, nextToken: "cursor-out" },
    want: { period, list: [model], totalCount: 9, nextToken: "cursor-out" },
    text: "Next page: --next-token cursor-out",
  },
  {
    name: "monitor metrics",
    command: commands.monitorMetrics,
    flags: { ...range, metric: "model_call_failed_count", step: 60 },
    payload: { originData: series },
    want: { period, step: 60, series },
    text: "monitor errors",
  },
  {
    name: "monitor errors",
    command: commands.monitorErrors,
    flags: { ...range },
    payload: { list: errorRows },
    want: { period, list: errorRows },
    text: "429",
  },
  {
    name: "monitor delivery status",
    command: commands.monitorDeliveryStatus,
    flags: {},
    want: { cmsSlrAuthorized: true, deliverySwitch: false, ...service },
    text: "monitor delivery enable",
    noDryRun: true,
  },
  {
    name: "monitor delivery enable",
    command: commands.monitorDeliveryEnable,
    flags: {},
    want: { activated: true, ...service },
    text: "Monitoring delivery is active.",
  },
  {
    name: "monitor delivery disable",
    command: commands.monitorDeliveryDisable,
    flags: {},
    want: { disabled: true },
    text: "Monitor delivery disabled.",
  },
  {
    name: "log status",
    command: commands.logStatus,
    flags: {},
    want: {
      slrAuthorized: true,
      audit: service,
      inference: service,
      auditSwitch: true,
      inferenceSwitch: false,
    },
    text: "log inference enable",
    noDryRun: true,
  },
  {
    name: "log audit list",
    command: commands.logAuditList,
    flags: { ...range, nextToken: "cursor-in" },
    payload: { list: [entry], totalCount: 9, nextToken: "cursor-out" },
    want: { list: [entry], totalCount: 9, nextToken: "cursor-out" },
    text: "Next page: --next-token cursor-out",
  },
  {
    name: "log audit get",
    command: commands.logAuditGet,
    flags: { ...range, requestId },
    payload: { list: [entry] },
    want: entry,
    text: '"audit": "raw"',
  },
  {
    name: "log audit count",
    command: commands.logAuditCount,
    flags: { ...range, model: "qwen-test" },
    want: { kind: "audit", period, count: 5 },
    text: "Audit logs: 5",
  },
  {
    name: "log audit enable",
    command: commands.logAuditEnable,
    flags: { noWait: true },
    want: { enabled: true, kind: "audit", instanceStatus: "Ready" },
    text: "The SLS instance may still be initializing",
  },
  {
    name: "log audit disable",
    command: commands.logAuditDisable,
    flags: {},
    want: { disabled: true, kind: "audit" },
    text: "Audit log delivery disabled.",
  },
  {
    name: "log inference list",
    command: commands.logInferenceList,
    flags: { ...range, statusCode: "SUCCESS,SERVER_ERROR" },
    payload: { list: [entry], totalCount: 9 },
    want: { list: [entry], totalCount: 9 },
    text: requestId,
  },
  {
    name: "log inference get",
    command: commands.logInferenceGet,
    flags: { ...range, requestId },
    payload: { list: [entry] },
    want: { ...entry, request: "Request body", response: "Response body" },
    text: "Request body",
  },
  {
    name: "log inference count",
    command: commands.logInferenceCount,
    flags: { ...range },
    want: { kind: "inference", period, count: 5 },
    text: "Inference logs: 5",
  },
  {
    name: "log inference enable",
    command: commands.logInferenceEnable,
    flags: { noWait: true },
    want: { enabled: true, kind: "inference", instanceStatus: "Ready" },
    text: "Inference log delivery enabled.",
  },
  {
    name: "log inference disable",
    command: commands.logInferenceDisable,
    flags: {},
    want: { disabled: true, kind: "inference" },
    text: "Inference log delivery disabled.",
  },
  {
    name: "log trace list",
    command: commands.logTraceList,
    flags: { ...range, resourceId: "qwen-test" },
    payload: { originData: { list: [trace], totalCount: 9 } },
    want: { list: [trace], totalCount: 9 },
    text: "trace-test",
  },
  {
    name: "log trace get",
    command: commands.logTraceGet,
    flags: { ...range, traceId: "trace-test" },
    payload: { originData: trace },
    want: trace,
    text: "Child span",
  },
  {
    name: "log trace stats",
    command: commands.logTraceStats,
    flags: { ...range },
    payload: { "qwen-test": traceStats },
    want: { period, list: [traceStats] },
    text: "qwen-test",
  },
];
let failure = false;
let cold = false;
let guardInference = false;
let pendingFirst = false;
let originEmpty = false;
let calls: Array<{ api: string; data: Record<string, unknown>; switchAgent?: number }> = [];
const businessCalls = () => calls.filter((call) => call.api !== workspaceApi);
afterEach(() => {
  vi.restoreAllMocks();
  failure = false;
  cold = false;
  guardInference = false;
  pendingFirst = false;
  originEmpty = false;
  vi.unstubAllEnvs();
  calls = [];
});
async function invoke(
  scenario: Scenario,
  display: { format: "text" | "json"; quiet?: boolean; verbose?: boolean; dryRun?: boolean },
) {
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    strayOut += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    strayErr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    env: {},
    file: { workspace_id: "ws-test" },
    configPath: "/tmp/telemetry-output-nonexistent/config.json",
  });
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  });
  let authorized = !cold,
    ready = !cold,
    opened = !cold;
  interface FixtureClient {
    baseUrl: string;
    withConsoleSwitchAgent(agent: number): FixtureClient;
    console(api: string, data: Record<string, unknown>): Promise<unknown>;
  }
  function makeClient(switchAgent?: number): FixtureClient {
    return {
      withConsoleSwitchAgent: makeClient,
      baseUrl: "http://127.0.0.1:1",
      console: async (api: string, data: Record<string, unknown>) => {
        calls.push({ api, data: structuredClone(data), switchAgent });
        if (failure) throw new BailianError("Original gateway failure", ExitCode.GENERAL);
        if (api === workspaceApi)
          return { data: [{ workspaceId: "ws-test", tenantId: String(mappedAgent) }] };
        if (
          pendingFirst &&
          api.endsWith("getModelStatistic") &&
          calls.filter((call) => call.api === api).length === 1
        )
          return { taskId: "async-task" };
        if (api.includes("getTelemetrySlrStatus")) return { result: authorized };
        if (api.includes("createTelemetrySlr")) {
          authorized = true;
          return {};
        }
        if (api.includes("getTelemetryServiceStatus"))
          return ready
            ? structuredClone(service)
            : { openStatus: opened, instanceStatus: "NotExist" };
        if (api.includes("initCmsService")) {
          opened = true;
          return {};
        }
        if (api.includes("initTelemetryStoreInstance")) {
          ready = true;
          opened = true;
          return {};
        }
        if (api.includes("getTelemetryGroupStatus")) {
          const reqDTO = data.reqDTO as { telemetryType: string };
          return {
            list: [
              {
                workspaceId: "ws-test",
                telemetryStatus:
                  reqDTO.telemetryType === "AuditLog" || guardInference ? "enable" : "disable",
              },
            ],
          };
        }
        if (scenario.name.endsWith(" count") && api.endsWith("listModelLogs")) {
          return { list: [], totalCount: 5 };
        }
        if (api.includes("getModelOriginLog"))
          return originEmpty
            ? {}
            : { originLog: { request: "Request body", response: "Response body" } };
        if (api.includes("enableTelemetryGroup") || api.includes("disableTelemetryGroup"))
          return {};
        return structuredClone(scenario.payload ?? {});
      },
    };
  }
  const client = makeClient();
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        flags: scenario.flags,
        settings,
        client,
        output: reporter.output,
        localize,
        identity: { binName: "bl", version: "test", clientName: "test", npmPackage: "test" },
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, strayOut, strayErr, exitCode };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}
const matrix = cases.flatMap((scenario) =>
  (["text", "json"] as const).flatMap((format) =>
    [false, true].flatMap((quiet) =>
      [false, true].map((verbose) => ({ scenario, name: scenario.name, format, quiet, verbose })),
    ),
  ),
);
test.each(matrix)(
  "$name uses result channel: $format q=$quiet v=$verbose",
  async ({ scenario, ...display }) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    if (display.format === "json") {
      expect(JSON.parse(result.stdout)).toEqual(scenario.want);
      expect(result.stderr).toBe("");
    } else expect(result.stdout).toContain(scenario.text);
    expect(calls.filter((call) => call.api === workspaceApi)).toHaveLength(1);
    expect(calls[0]?.switchAgent).toBeUndefined();
    expect(businessCalls().length).toBeGreaterThan(0);
    for (const call of businessCalls()) expect(call.switchAgent, call.api).toBe(mappedAgent);
  },
);
test.each(cases.filter((scenario) => !scenario.noDryRun))(
  "$name dry-run has no calls and uses result channel",
  async (scenario) => {
    const result = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    expect(JSON.parse(result.stdout)).toBeTypeOf("object");
    expect(calls).toEqual([]);
  },
);
test.each(cases)("$name gateway failure returns one JSON error", async (scenario) => {
  failure = true;
  const result = await invoke(scenario, { format: "json", quiet: true, verbose: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.strayOut).toBe("");
  expect(result.strayErr).toBe("");
  expect(JSON.parse(result.stderr).error.message).toBe("Original gateway failure");
});
test.each(["monitor delivery enable", "log audit enable", "log inference enable"])(
  "cold $name progress respects JSON and quiet without changing requests",
  async (name) => {
    const base = cases.find((scenario) => scenario.name === name)!;
    const scenario = { ...base, flags: { noWait: true } };
    cold = true;
    const json = await invoke(scenario, { format: "json", quiet: false });
    expect(json.exitCode, json.stderr + json.strayErr).toBe(0);
    expect(json.strayOut).toBe("");
    expect(json.strayErr).toBe("");
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toEqual(
      name.startsWith("monitor")
        ? { activated: false, submitted: true }
        : {
            enabled: true,
            kind: name.includes("audit") ? "audit" : "inference",
            instanceStatus: "NotExist",
          },
    );
    const jsonCalls = structuredClone(calls);
    calls = [];
    const text = await invoke(scenario, { format: "text", quiet: true });
    expect(text.exitCode).toBe(0);
    expect(text.strayOut).toBe("");
    expect(text.strayErr).toBe("");
    expect(text.stderr).toBe("");
    expect(calls).toEqual(jsonCalls);
  },
);
test("audit disable still refuses while inference is enabled", async () => {
  guardInference = true;
  const scenario = cases.find((candidate) => candidate.name === "log audit disable")!;
  const result = await invoke(scenario, { format: "json", quiet: true });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr).error.message).toContain("inference log is enabled");
  expect(calls.some((call) => call.api.includes("disableTelemetryGroup"))).toBe(false);
});

test.each(["monitor delivery enable", "log audit enable", "log inference enable"])(
  "ordinary text keeps cold-start progress for %s",
  async (name) => {
    const base = cases.find((scenario) => scenario.name === name)!;
    cold = true;
    const result = await invoke(
      { ...base, flags: { noWait: true } },
      { format: "text", quiet: false },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    expect(result.stderr).toContain("Authorizing the service-linked role");
    expect(result.stderr).toContain(
      name.startsWith("monitor") ? "CMS service" : "Initializing the SLS",
    );
    expect(result.stdout).toContain(
      name.startsWith("monitor") ? "Activation submitted" : "log delivery enabled",
    );
  },
);

test("console async task IDs are reissued without interim JSON output", async () => {
  pendingFirst = true;
  const scenario = cases[0]!;
  const result = await invoke(scenario, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(scenario.want);
  expect(result.strayOut).toBe("");
  expect(result.strayErr).toBe("");
  expect(calls.filter((call) => call.api === workspaceApi)).toHaveLength(1);
  expect(businessCalls()).toHaveLength(2);
  expect(businessCalls()[1]!.data.reqDTO).toMatchObject({ asyncTaskId: "async-task" });
});

test.each([true, false])(
  "OSS-backed metric payload success=%s preserves JSON/error boundaries",
  async (success) => {
    const base = cases.find((scenario) => scenario.name === "monitor metrics")!;
    const urls: string[] = [];
    vi.spyOn(httpTransport, "fetch").mockImplementation(async (url) => {
      urls.push(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
      return new Response(JSON.stringify(series), { status: success ? 200 : 503 });
    });
    const result = await invoke(
      { ...base, payload: { dataDownloadUrl: "http://oss.example.test/data.json" } },
      { format: "json", quiet: true },
    );
    expect(urls).toEqual(["https://oss.example.test/data.json"]);
    expect(result.strayOut).toBe("");
    expect(result.strayErr).toBe("");
    if (success) {
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(base.want);
    } else {
      expect(result.exitCode).toBe(ExitCode.NETWORK);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error.message).toContain("HTTP 503");
    }
  },
);

test("audit and inference queries retain different timestamp and filter contracts", async () => {
  const audit = cases.find((scenario) => scenario.name === "log audit list")!;
  await invoke(audit, { format: "json", quiet: true });
  expect(businessCalls()[0]!.data.reqDTO).toMatchObject({
    startTime: timestamp,
    needFullContent: false,
    nextToken: "cursor-in",
  });
  calls = [];
  const inference = cases.find((scenario) => scenario.name === "log inference list")!;
  await invoke(inference, { format: "json", quiet: true });
  expect(businessCalls()[0]!.data.reqDTO).toMatchObject({
    startTime: String(timestamp),
    needFullContent: false,
    statusCodeTypes: ["SUCCESS", "SERVER_ERROR"],
  });
});

test.each(["monitor metrics", "monitor delivery status", "log status", "log inference get"])(
  "colored final hint retains one terminal newline: %s",
  async (name) => {
    vi.stubEnv("NO_COLOR", undefined);
    const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    originEmpty = true;
    try {
      const scenario = cases.find((candidate) => candidate.name === name)!;
      const result = await invoke(scenario, { format: "text", quiet: false });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toContain("\x1b[");
      const visible = stripVTControlCharacters(result.stdout);
      expect(visible.endsWith("\n")).toBe(true);
      expect(visible.endsWith("\n\n")).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }
  },
);
