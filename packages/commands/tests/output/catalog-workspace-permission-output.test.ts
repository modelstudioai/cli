import baseline from "./fixtures/catalog-workspace-permission.json" with { type: "json" };
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
const modelApi = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";
const schemaApi = "zeldaEasy.bmp.modelPredictRpcService.getPredictParamConfig";
const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
const loginApi = "zeldaEasy.cornerstone-portal.cs-console.loginInfo";
const buyResultApi = "zeldaEasy.bailian-commerce.bill.queryBuyPostpaidResult";
const commodityApi = "zeldaEasy.bailian-commerce.bill.postpaidCommodityOrderInfo";
const buyApi = "zeldaEasy.bailian-commerce.bill.buyPostpaidCommodity";
const retained = { future: { values: [false, 0, null, []] } };
const item = {
  model: "qwen-fixture",
  name: "Fixture Qwen",
  description: "Fixture model",
  provider: "alibaba",
  capabilities: ["TG"],
  features: ["function-calling"],
  contextWindow: 4096,
  maxOutputTokens: 1024,
  maxInputTokens: 4096,
  category: "latest",
  openSource: false,
  prices: [
    { type: "input", price: 0, priceUnit: "per 1k tokens" },
    { type: "output", price: 1.5, priceUnit: "per 1k tokens" },
  ],
  qpmInfo: {
    free: {
      count_limit: 0,
      count_limit_period: 60,
      usage_limit: 0,
      usage_limit_period: 60,
      usage_limit_field: "total_tokens",
    },
  },
  sampleCodeV2: { openai: { completionsAPI: { python: { code: 'print("hello")\n' } } } },
  ...retained,
};
const family = {
  model: "group-qwen-fixture",
  name: "Fixture",
  description: "Fixture family",
  updateAt: "2026-01-02",
  items: [item, { ...item, model: "qwen-fixture-2024-09-19", category: "snapshot" }],
};
const deadFamily = {
  model: "group-qwen-dead",
  name: "Dead",
  items: [{ ...item, model: "qwen-dead", offlineAt: "2020-01-01T00:00:00Z" }],
};
const schema = [
  { name: "Temperature", key: "temperature", default: 0, range: [0, 2], tip: "fixture" },
  { name: "Stream", key: "stream", default: false, range: null },
];
const workspace = [
  { workspaceId: "ws-one", agentName: "Demo", defaultAgent: true, tenantId: 456 },
  { workspaceId: "ws-two", agentName: "Other", defaultAgent: false, tenantId: 789 },
];
const permission = {
  output: {
    total: 0,
    page_no: 1,
    page_size: 2,
    permissions: [
      {
        model: "qwen-fixture",
        name: "Fixture",
        permissions: { inference: true, fine_tune: false, deploy: null },
        ...retained,
      },
    ],
  },
  request_id: "permission-request",
  ...retained,
};
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  chinese: string;
}
const cases: Scenario[] = [
  {
    name: "model list",
    command: commands.modelList,
    flags: { page: 1, pageSize: 10 },
    chinese: "总计",
  },
  {
    name: "model detail",
    command: commands.modelList,
    flags: { model: "qwen-fixture" },
    chinese: "总计",
  },
  {
    name: "model enrich",
    command: commands.modelList,
    flags: { model: "qwen-fixture", enrich: true },
    chinese: "参数",
  },
  {
    name: "model search",
    command: commands.modelSearch,
    flags: { keyword: "qwen fixture", limit: 10 },
    chinese: "匹配",
  },
  {
    name: "model code",
    command: commands.modelCode,
    flags: { model: "qwen-fixture", sdk: "openai", api: "completionsAPI", lang: "python" },
    chinese: 'print("hello")',
  },
  { name: "workspace list", command: commands.workspaceList, flags: {}, chinese: "工作空间" },
  {
    name: "workspace init",
    command: commands.workspaceInit,
    flags: {
      accessKeyId: "fixture-access-key",
      accessKeySecret: "fixture-access-secret",
      securityToken: "fixture-security-token",
    },
    chinese: "status: ready",
  },
  {
    name: "permission list",
    command: commands.permissionList,
    flags: { scope: "authorizable", page: 1, pageSize: 2 },
    chinese: "推理",
  },
  {
    name: "permission grant",
    command: commands.permissionGrant,
    flags: { model: "qwen-fixture, model-two", action: "inference,deploy", all: false },
    chinese: "已授予",
  },
  {
    name: "permission revoke",
    command: commands.permissionRevoke,
    flags: { model: "qwen-fixture, model-two", action: "inference,deploy", all: false },
    chinese: "已撤销",
  },
];
let calls: Array<{
  path: string;
  api?: string;
  action?: string;
  method: string;
  body?: unknown;
  query: string;
}>;
let missing: boolean,
  overdue: boolean,
  uninitialized: boolean,
  existingUser: boolean,
  pending: boolean,
  neverReady: boolean;
let failing: string | undefined;
let catalogTotal: number;
let permissionResponse: unknown;
beforeEach(() => {
  calls = [];
  missing = false;
  overdue = false;
  uninitialized = false;
  existingUser = false;
  pending = false;
  neverReady = false;
  failing = undefined;
  catalogTotal = 2;
  permissionResponse = permission;
  vi.stubEnv("NO_COLOR", "1");
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers),
      action = headers.get("x-acs-action") ?? undefined;
    const raw = typeof init?.body === "string" ? init.body : "";
    const encoded = new URLSearchParams(raw).get("params");
    if (encoded) {
      const params = JSON.parse(encoded) as { Api: string; Data: Record<string, unknown> };
      calls.push({
        path: url.pathname,
        api: params.Api,
        method: init?.method ?? "GET",
        body: params.Data,
        query: url.search,
      });
      if (params.Api === failing)
        return Response.json({
          data: {
            success: false,
            errorCode: "Original.Rejected",
            message: "original service failure",
          },
        });
      let payload: unknown;
      if (params.Api === modelApi) {
        const request = params.Data.input as Record<string, unknown>;
        payload = {
          total: catalogTotal,
          list: missing ? [] : request.queryGroupByModel ? [family] : [family, deadFamily],
        };
      } else if (params.Api === schemaApi) payload = { predictConfig: schema };
      else if (params.Api === workspaceApi) payload = missing ? [] : workspace;
      else if (params.Api === loginApi)
        payload = {
          spaceInited: !uninitialized,
          aliyun: { uid: "fixture-user" },
          privateResponseCanary: "SHOULD_NOT_APPEAR_IN_DIAGNOSTICS",
        };
      else if (params.Api.endsWith("initSpace")) payload = {};
      else if (params.Api === buyResultApi)
        payload =
          pending && calls.filter((call) => call.api === buyResultApi).length === 1
            ? "buying"
            : pending
              ? "success"
              : "none";
      else if (params.Api === commodityApi)
        payload = neverReady
          ? [{ commodityCode: "svc-one", status: 1 }]
          : [
              { commodityCode: "svc-one", status: 10 },
              ...(overdue ? [{ commodityCode: "svc-due", status: 11 }] : []),
            ];
      else if (params.Api === buyApi) payload = {};
      else throw new Error(`Unexpected fake console API ${params.Api}`);
      return Response.json({ data: { DataV2: { data: { data: payload } } } });
    }
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({
      path: url.pathname,
      action,
      method: init?.method ?? "GET",
      body,
      query: url.search,
    });
    if (url.pathname === failing)
      return Response.json(
        { code: "Rejected", message: "original service failure", request_id: "request-failed" },
        { status: 403 },
      );
    if (action === "GenerateCLIAccessToken")
      return Response.json({ cliAccessToken: "fixture-generated-token" });
    if (url.pathname.endsWith("/User/createUser"))
      return Response.json(
        existingUser
          ? { Success: false, Code: "AlreadyExists", Message: "User already exists" }
          : { Success: true },
      );
    if (url.pathname === "/bailianControl/workspaces")
      return Response.json({ data: { data: workspace } });
    if (url.pathname.endsWith("/serviserAuthorityPolicy/resetPolicies4Agent"))
      return Response.json({ Success: true });
    if (url.pathname.endsWith("/models/permissions"))
      return Response.json(
        init?.method === "POST"
          ? { request_id: "permission-request", ...retained }
          : permissionResponse,
      );
    throw new Error(`Unexpected fake HTTP path ${url.pathname}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
interface Display {
  format: "text" | "json";
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  language?: "en-US" | "zh-CN";
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
    },
    file: { language: display.language ?? "en-US" },
    env: {},
    configPath: "/tmp/catalog-output-no-config/config.json",
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
    apiCred: { token: "fixture-api-token", source: "flag", baseUrl: "https://fixture.invalid" },
    consoleCred: {
      token: "fixture-console-token",
      region: "cn-beijing",
      site: "domestic",
      source: "flag",
    },
    debug: (record) => reporter.output.debug(record),
  });
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        identity,
        flags,
        settings,
        client,
        localize,
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
    [false, true].map((verbose) => ({ format: format as "text" | "json", quiet, verbose })),
  ),
);
for (const scenario of cases) {
  test.each(modes)(`${scenario.name} uses scoped complete results: %j`, async (display) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    if (display.format === "json") {
      expect(JSON.parse(result.stdout)).toEqual(
        baseline[scenario.name as keyof typeof baseline].json,
      );
      expect(diagnostics(result.stderr).every((record) => record.debug !== undefined)).toBe(true);
    } else expect(result.stdout).toBe(baseline[scenario.name as keyof typeof baseline].text);
    for (const secret of [
      "fixture-api-token",
      "fixture-console-token",
      "fixture-generated-token",
      "fixture-access-secret",
      "fixture-security-token",
      "SHOULD_NOT_APPEAR_IN_DIAGNOSTICS",
    ])
      expect(result.stdout + result.stderr).not.toContain(secret);
  });
  test(`${scenario.name} Chinese final text`, async () => {
    const result = await invoke(scenario, { format: "text", quiet: true, language: "zh-CN" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(result.stdout).toContain(scenario.chinese);
  });
  test.each(["json", "text"] as const)(
    `${scenario.name} dry-run %s performs no HTTP`,
    async (format) => {
      const result = await invoke(scenario, { format, quiet: true, dryRun: true });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.strayOut + result.strayErr).toBe("");
      expect(calls).toEqual([]);
      if (format === "json") expect(JSON.parse(result.stdout)).toBeDefined();
    },
  );
}
test.each(modes)("missing model detail remains exit0 and gives null JSON: %j", async (display) => {
  missing = true;
  const result = await invoke(cases[1]!, display);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr).toBe("");
  if (display.format === "json") expect(JSON.parse(result.stdout)).toBeNull();
  else expect(result.stdout).toBe('Model "qwen-fixture" not found.\n');
});
test.each(modes)("empty workspace list keeps full result: %j", async (display) => {
  missing = true;
  const workspaceResult = await invoke(cases[5]!, display);
  expect(workspaceResult.exitCode, workspaceResult.stderr).toBe(0);
  expect(workspaceResult.strayOut).toBe("");
  if (display.format === "json") expect(JSON.parse(workspaceResult.stdout)).toEqual([]);
});
test("model enrichment still requests only the trunk schema", async () => {
  const result = await invoke(cases[2]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(
    calls
      .filter((call) => call.api === schemaApi)
      .map((call) => (call.body as { modelId: string }).modelId),
  ).toEqual(["qwen-fixture"]);
  expect(JSON.parse(result.stdout).items[0].predictConfig).toEqual(schema);
});
test.each([8, 9])("permission %s applies only selected tri-state action fields", async (index) => {
  const result = await invoke(cases[index]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(calls.at(-1)!.body).toEqual({
    models: [
      { model: "qwen-fixture", inference: index === 8, deploy: index === 8 },
      { model: "model-two", inference: index === 8, deploy: index === 8 },
    ],
  });
  expect(JSON.parse(result.stdout)).toMatchObject({
    models: ["qwen-fixture", "model-two"],
    actions: ["inference", "deploy"],
    request_id: "permission-request",
  });
});
test.each([8, 9])("permission all switch %s keeps the server patch and result", async (index) => {
  const result = await invoke(cases[index]!, { format: "json", quiet: true }, { all: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(calls.at(-1)!.body).toEqual({ access_all_entities: index === 8 ? "OPEN" : "CLOSE" });
  expect(JSON.parse(result.stdout)).toMatchObject({
    all: true,
    action: "inference",
    [index === 8 ? "granted" : "revoked"]: true,
  });
});
test("workspace signed steps retain order and default workspace agent", async () => {
  const result = await invoke(cases[6]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ status: "ready", activeServices: ["svc-one"] });
  expect(calls.map((call) => call.api ?? call.action)).toEqual([
    "GenerateCLIAccessToken",
    loginApi,
    "CreateUser",
    "ListWorkspaces",
    "ChangeUserPermissions",
    buyResultApi,
    commodityApi,
  ]);
  const request = calls.find((call) => call.action === "ChangeUserPermissions")!.body as {
    data: string;
  };
  expect(JSON.parse(request.data)).toEqual({
    cornerstoneParam: {},
    outerKey: "fixture-user",
    agentId: 456,
    policyIndexList: [1],
  });
});
test.each([false, true])("workspace overdue warning remains JSONL with quiet=%s", async (quiet) => {
  overdue = true;
  const result = await invoke(cases[6]!, { format: "json", quiet });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ status: "ready", activeServices: ["svc-one"] });
  expect(diagnostics(result.stderr)).toEqual([
    {
      warning: {
        code: "WORKSPACE_SERVICES_OVERDUE",
        message: "Some services are overdue:",
        details: { services: ["svc-due"] },
      },
    },
  ]);
});
test("workspace init preserves idempotent existing-user continuation", async () => {
  existingUser = true;
  uninitialized = true;
  const result = await invoke(cases[6]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).status).toBe("ready");
  expect(calls.some((call) => call.api?.endsWith("initSpace"))).toBe(true);
});
test("workspace init polls activation and keeps one final result", async () => {
  vi.useFakeTimers();
  pending = true;
  const response = invoke(cases[6]!, { format: "json", quiet: true });
  await vi.runAllTimersAsync();
  const result = await response;
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).status).toBe("ready");
  expect(calls.filter((call) => call.api === buyResultApi)).toHaveLength(2);
});
test("workspace activation timeout preserves TIMEOUT and no success result", async () => {
  vi.useFakeTimers();
  neverReady = true;
  const response = invoke(cases[6]!, { format: "json", quiet: true });
  await vi.runAllTimersAsync();
  const result = await response;
  expect(result.exitCode).toBe(5);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr).at(-1).error.message).toContain("Timed out");
  expect(calls.filter((call) => call.api === commodityApi)).toHaveLength(21);
  expect(calls.filter((call) => call.api === buyApi)).toHaveLength(1);
});
test("workspace failure stops before authorization or commodity purchase", async () => {
  failing = loginApi;
  const result = await invoke(cases[6]!, { format: "json", quiet: true });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)).toHaveLength(1);
  expect(calls.map((call) => call.api ?? call.action)).toEqual([
    "GenerateCLIAccessToken",
    loginApi,
  ]);
});
test("TTY workspace table keeps color resets before LF and JSON uncolored", async () => {
  const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const previousNoColor = process.env.NO_COLOR;
  try {
    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const text = await invoke(cases[5]!, { format: "text", quiet: true });
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.strayOut).toBe("");
    expect(text.stdout).toContain("\x1b[");
    expect(stripVTControlCharacters(text.stdout)).toContain("ws-one");
    const json = await invoke(cases[5]!, { format: "json", quiet: true });
    expect(JSON.parse(json.stdout)[0].default).toBe(true);
    expect(json.stdout).not.toContain("\x1b");
  } finally {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
    if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
  }
});

test.each(modes)("empty permission list keeps total and hint: %j", async (display) => {
  permissionResponse = { output: { permissions: [], total: 0 } };
  const result = await invoke(cases[7]!, display, { scope: "authorized" });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.strayOut + result.strayErr).toBe("");
  if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual({ items: [], total: 0 });
  else expect(result.stdout).toContain("Nothing granted yet");
});
