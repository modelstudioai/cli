import englishText from "./fixtures/alert-text.json" with { type: "json" };
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import * as commands from "../../src/index.ts";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
const statusApi = "zeldaEasy.bailian-telemetry.activate.getTelemetryServiceStatus";
const ruleApi = "zeldaEasy.bailian-telemetry.alertRule.";
const templateApi = "zeldaEasy.bailian-telemetry.alertTemplate.";
const metricApi = "zeldaEasy.bailian-telemetry.alertMetric.listMetrics";
const retained = { future: { values: [false, 0, null, []] } };
const rule = {
  ruleId: "rule-one",
  name: "Demo",
  level: "ERROR",
  enabled: false,
  resourceIds: ["model-one", "model-two"],
  interval: 0,
  duration: 0,
  ...retained,
};
const condition = {
  metricName: "calls",
  aggregator: "sum",
  compareType: ">",
  compareValue: "0",
  period: 60,
};
const template = {
  templateId: "template-one",
  templateName: "Demo",
  source: "Official",
  logicalOperator: "and",
  conditions: [condition, { ...condition, metricName: "failures", compareValue: "1" }],
  ...retained,
};
const history = {
  alertHistoryId: "history-one",
  alertRuleId: "rule-one",
  ruleDisplayName: "Demo",
  status: "ALARM",
  maxLevel: "ERROR",
  count: 0,
  message: "raw server message",
  startTime: 0,
  endTime: null,
  instanceDetail: { model: "one", zone: "test" },
  ...retained,
};
const metric = {
  metricName: "calls",
  aggregators: ["sum", "avg"],
  unit: null,
  desc: "Call count",
  ...retained,
};
const page = (item: unknown) => ({
  list: [item],
  totalCount: 0,
  nextToken: "cursor-out",
  ...retained,
});
const projection = (item: unknown) => ({ list: [item], totalCount: 0, nextToken: "cursor-out" });
interface Scenario {
  name: string;
  command: AnyCommand;
  api: string;
  flags: Record<string, unknown>;
  payload: unknown;
  want: unknown;
  chinese: string;
}
const writeFlags = {
  name: "Demo",
  templateId: "template-one",
  model: "model-one, model-two",
  level: "ERROR",
  interval: 30,
  duration: 0,
  silence: 0,
  notifyDays: "1,5",
  notifyWindow: "09:00-18:00",
  gmtOffset: "+0800",
  contact: "contact-one",
  contactGroup: "group-one",
};
const cases: Scenario[] = [
  {
    name: "list",
    command: commands.alertList,
    api: ruleApi + "listAlertRules",
    flags: {
      enabled: false,
      name: "Demo",
      level: "ERROR",
      skip: 0,
      maxResults: 2,
      nextToken: "cursor-in",
    },
    payload: page(rule),
    want: projection(rule),
    chinese: "规则 ID",
  },
  {
    name: "create",
    command: commands.alertCreate,
    api: ruleApi + "createAlertRule",
    flags: writeFlags,
    payload: { ruleId: "rule-new" },
    want: { created: true, ruleId: "rule-new" },
    chinese: "告警规则已创建",
  },
  {
    name: "update",
    command: commands.alertUpdate,
    api: ruleApi + "updateAlertRule",
    flags: { ...writeFlags, ruleId: "rule-one" },
    payload: retained,
    want: { updated: true, ruleId: "rule-one" },
    chinese: "告警规则已更新",
  },
  {
    name: "delete",
    command: commands.alertDelete,
    api: ruleApi + "deleteAlertRules",
    flags: { ruleId: "rule-one, rule-two" },
    payload: retained,
    want: { deleted: ["rule-one", "rule-two"] },
    chinese: "已删除 2 个告警规则",
  },
  {
    name: "enable",
    command: commands.alertEnable,
    api: ruleApi + "enableAlertRule",
    flags: { ruleId: "rule-one" },
    payload: retained,
    want: { enabled: true, ruleId: "rule-one" },
    chinese: "告警规则已启用",
  },
  {
    name: "disable",
    command: commands.alertDisable,
    api: ruleApi + "disableAlertRule",
    flags: { ruleId: "rule-one" },
    payload: retained,
    want: { enabled: false, ruleId: "rule-one" },
    chinese: "告警规则已停用",
  },
  {
    name: "history",
    command: commands.alertHistory,
    api: ruleApi + "listAlertHistories",
    flags: {
      startTime: "2026-01-02T03:04:00Z",
      endTime: "2026-01-02T04:04:00Z",
      ruleId: "rule-one",
      status: "ALARM",
      level: "ERROR",
      maxResults: 2,
      skip: 0,
      nextToken: "cursor-in",
    },
    payload: page(history),
    want: projection(history),
    chinese: "开始时间",
  },
  {
    name: "metrics",
    command: commands.alertMetrics,
    api: metricApi,
    flags: {},
    payload: { result: [metric], ...retained },
    want: [metric],
    chinese: "聚合方式",
  },
  {
    name: "template list",
    command: commands.alertTemplateList,
    api: templateApi + "listAlertTemplates",
    flags: { source: "Official", skip: 0, maxResults: 2 },
    payload: page(template),
    want: projection(template),
    chinese: "模板 ID",
  },
  {
    name: "template create",
    command: commands.alertTemplateCreate,
    api: templateApi + "createAlertTemplate",
    flags: {
      name: "Demo",
      from: "template-source",
      condition: ["calls:sum:>:0:60"],
      logicalOperator: "and",
    },
    payload: { templateId: "template-new" },
    want: { created: true, templateId: "template-new" },
    chinese: "告警模板已创建",
  },
  {
    name: "template update",
    command: commands.alertTemplateUpdate,
    api: templateApi + "updateAlertTemplate",
    flags: {
      name: "Demo",
      templateId: "template-one",
      condition: ["calls:sum:>:0:60"],
      logicalOperator: "and",
    },
    payload: retained,
    want: { updated: true, templateId: "template-one" },
    chinese: "告警模板已更新",
  },
  {
    name: "template delete",
    command: commands.alertTemplateDelete,
    api: templateApi + "deleteAlertTemplates",
    flags: { templateId: "template-one,template-two" },
    payload: { deleted: false, ...retained },
    want: { deleted: ["template-one", "template-two"], result: { deleted: false, ...retained } },
    chinese: "已删除 2 个告警模板",
  },
];
let calls: Array<{ api: string; data: Record<string, unknown>; switchAgent?: number }>;
let payloads: Map<string, unknown>;
let failApi: string | undefined;
let closed: boolean;
let pending: boolean;
let missingWorkspace: boolean;
beforeEach(() => {
  calls = [];
  payloads = new Map(cases.map((scenario) => [scenario.api, scenario.payload]));
  failApi = undefined;
  closed = false;
  pending = false;
  missingWorkspace = false;
  vi.stubEnv("NO_COLOR", "1");
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (_input, init) => {
    if (typeof init?.body !== "string") throw new Error("Expected a form-encoded gateway request.");
    const params = JSON.parse(new URLSearchParams(init.body).get("params")!) as {
      Api: string;
      Data: { cornerstoneParam: { switchAgent?: number }; [key: string]: unknown };
    };
    const { cornerstoneParam, ...data } = params.Data;
    calls.push({ api: params.Api, data, switchAgent: cornerstoneParam.switchAgent });
    if (params.Api === failApi)
      return Response.json({
        data: { success: false, errorCode: "Original.Rejected", message: "original failure" },
      });
    let payload: unknown;
    if (params.Api === workspaceApi)
      payload = missingWorkspace ? [] : [{ workspaceId: "ws-test", tenantId: "7654321" }];
    else if (params.Api === statusApi) {
      if (pending && calls.filter((call) => call.api === statusApi).length === 1)
        payload = { taskId: "pending-one" };
      else payload = { openStatus: !closed };
    } else payload = payloads.get(params.Api);
    return Response.json({ data: { DataV2: { data: { data: payload } } } });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
interface Display {
  format: "json" | "text";
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  language?: "en-US" | "zh-CN";
  region?: string;
}
async function invoke(scenario: Scenario, display: Display, flags = scenario.flags) {
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "";
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    strayOut += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    strayErr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
      consoleRegion: display.region ?? "cn-beijing",
      consoleSwitchAgent: 111,
    },
    file: { language: display.language ?? "en-US", workspace_id: "ws-test" },
    env: {},
    configPath: "/tmp/alert-output-isolated-nonexistent/config.json",
  });
  const localize = (text: LocalizedText) =>
    typeof text === "string" ? text : text[display.language ?? "en-US"];
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://fixture.invalid",
    consoleCred: {
      token: "fixture-console-token",
      source: "flag",
      region: display.region ?? "cn-beijing",
      site: "domestic",
      switchAgent: 111,
    },
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        flags,
        settings,
        identity,
        localize,
        client,
        output: reporter.output,
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, strayOut, strayErr, exitCode };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}
const diagnostics = (stderr: string) =>
  stderr.trim()
    ? stderr
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
const modes = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
for (const scenario of cases) {
  test.each(modes)(`${scenario.name} keeps complete scoped result: %j`, async (display) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    if (display.format === "json") {
      expect(JSON.parse(result.stdout)).toEqual(scenario.want);
      expect(diagnostics(result.stderr).every((record) => record.debug !== undefined)).toBe(true);
    } else expect(result.stdout).toBe(englishText[scenario.name as keyof typeof englishText]);
    expect(result.stdout + result.stderr).not.toContain("fixture-console-token");
    expect(calls.map((call) => call.api)).toEqual([workspaceApi, statusApi, scenario.api]);
    expect(calls.map((call) => call.switchAgent)).toEqual([111, 7654321, 7654321]);
  });
  test(`${scenario.name} supports Chinese final text`, async () => {
    const result = await invoke(scenario, { format: "text", quiet: true, language: "zh-CN" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(result.stdout).toContain(scenario.chinese);
  });
  test.each(["json", "text"] as const)(
    `${scenario.name} dry-run %s never calls the gateway`,
    async (format) => {
      const result = await invoke(scenario, { format, quiet: true, dryRun: true });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.strayOut + result.strayErr).toBe("");
      expect(calls).toEqual([]);
      if (format === "json")
        expect(JSON.parse(result.stdout)).toMatchObject({
          api: scenario.api,
          data: { reqDTO: expect.any(Object) },
        });
      else expect(result.stdout).toContain(scenario.api);
    },
  );
  test(`${scenario.name} leaves gateway failure to runtime once`, async () => {
    failApi = scenario.api;
    const result = await invoke(scenario, { format: "json", quiet: true });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.strayOut + result.strayErr).toBe("");
    expect(diagnostics(result.stderr)).toHaveLength(1);
    expect(diagnostics(result.stderr)[0].error.message).toBe(
      "Console gateway error: Original.Rejected",
    );
    expect(calls.map((call) => call.api)).toEqual([workspaceApi, statusApi, scenario.api]);
  });
}
for (const [index, empty] of [
  [0, "No alert rules found.\nNext page: --next-token cursor-out\n"],
  [6, "No alert history found in this range.\n"],
  [7, "No alertable metrics found.\n"],
  [8, "No alert templates found.\n"],
] as const) {
  test.each(modes)(`empty ${index} retains metadata and existing text: %j`, async (display) => {
    const scenario = cases[index]!;
    payloads.set(
      scenario.api,
      index === 7 ? [] : { list: [], totalCount: 0, nextToken: "cursor-out" },
    );
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    if (display.format === "json")
      expect(JSON.parse(result.stdout)).toEqual(
        index === 7 ? [] : { list: [], totalCount: 0, nextToken: "cursor-out" },
      );
    else expect(result.stdout).toBe(empty);
  });
}
test("CMS closed aborts before creating a rule", async () => {
  closed = true;
  const result = await invoke(cases[1]!, { format: "json", quiet: true });
  expect(result.exitCode).toBe(3);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)[0].error.hint).toContain("bl monitor delivery enable");
  expect(calls.map((call) => call.api)).toEqual([workspaceApi, statusApi]);
});
test("unknown workspace aborts before CMS/business requests", async () => {
  missingWorkspace = true;
  const result = await invoke(cases[1]!, { format: "json", quiet: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(calls.map((call) => call.api)).toEqual([workspaceApi]);
});
test("unsupported region aborts before any network call", async () => {
  const result = await invoke(cases[1]!, { format: "json", quiet: true, region: "us-west-1" });
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(calls).toEqual([]);
});
test("copy template resolves source conditions before the write using the same identity", async () => {
  const result = await invoke(
    cases[9]!,
    { format: "json", quiet: true },
    { name: "Copy", from: "template-source" },
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(cases[9]!.want);
  expect(calls.map((call) => call.api)).toEqual([
    workspaceApi,
    statusApi,
    cases[8]!.api,
    cases[9]!.api,
  ]);
  expect(calls.map((call) => call.switchAgent)).toEqual([111, 7654321, 7654321, 7654321]);
  expect(calls[2]!.data).toEqual({
    reqDTO: { resourceType: "model", templateId: "template-source", maxResults: 1, skip: 0 },
  });
  expect(calls[3]!.data).toEqual({
    reqDTO: {
      templateName: "Copy",
      resourceType: "model",
      logicalOperator: "or",
      srcTemplateId: "template-source",
      conditions: template.conditions,
    },
  });
});
test("missing source template fails without creating a template", async () => {
  payloads.set(cases[8]!.api, { list: [] });
  const result = await invoke(
    cases[9]!,
    { format: "json", quiet: true },
    { name: "Copy", from: "missing" },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)[0].error.message).toBe("Source template not found: missing");
  expect(calls.map((call) => call.api)).toEqual([workspaceApi, statusApi, cases[8]!.api]);
});
test("CMS preflight polling keeps the async task and workspace identity", async () => {
  pending = true;
  const result = await invoke(cases[0]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(cases[0]!.want);
  expect(calls.map((call) => call.api)).toEqual([
    workspaceApi,
    statusApi,
    statusApi,
    cases[0]!.api,
  ]);
  expect(calls[2]!.data).toMatchObject({
    reqDTO: { workspaceId: "ws-test", serviceType: "ModelMonitor", asyncTaskId: "pending-one" },
  });
});
test("rule write retains zero duration/silence and all notification fields", async () => {
  const result = await invoke(cases[1]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(calls.at(-1)!.data).toMatchObject({
    reqDTO: {
      workspaceId: "ws-test",
      name: "Demo",
      resourceIds: ["model-one", "model-two"],
      templateId: "template-one",
      level: "ERROR",
      interval: 30,
      duration: 0,
      notification: {
        dayOfWeek: [1, 5],
        startTime: "09:00",
        endTime: "18:00",
        gmtOffset: "+0800",
        silenceTime: 0,
        contacts: ["contact-one"],
        contactGroups: ["group-one"],
      },
    },
  });
});
test.each([1, 9])(
  "create %s preserves falsy ID values without changing response normalization",
  async (index) => {
    const scenario = cases[index]!;
    payloads.set(scenario.api, { data: 0 });
    const result = await invoke(scenario, { format: "json", quiet: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      index === 1 ? { created: true, ruleId: 0 } : { created: true, templateId: 0 },
    );
  },
);
test("JSON skips text-only metric rendering", async () => {
  const response = [{ metricName: "calls", aggregators: 0, unit: null, ...retained }];
  payloads.set(metricApi, response);
  const result = await invoke(cases[7]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(response);
});
test("TTY rule/history tables keep colors, plain pagination and JSON", async () => {
  const terminal = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const previousNoColor = process.env.NO_COLOR;
  try {
    delete process.env.NO_COLOR;
    vi.stubEnv("FORCE_COLOR", "1");
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    for (const index of [0, 6]) {
      const result = await invoke(cases[index]!, { format: "text", quiet: true });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.strayOut).toBe("");
      expect(result.stdout).toContain("\x1b[");
      expect(stripVTControlCharacters(result.stdout)).toContain("ERROR");
      expect(result.stdout).toContain("\x1b[0m\n");
      expect(result.stdout.endsWith("Next page: --next-token cursor-out\n")).toBe(true);
      const json = await invoke(cases[index]!, { format: "json", quiet: true });
      expect(JSON.parse(json.stdout)).toEqual(cases[index]!.want);
      expect(json.stdout).not.toContain("\x1b");
    }
  } finally {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
    if (terminal) Object.defineProperty(process.stdout, "isTTY", terminal);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
  }
});
