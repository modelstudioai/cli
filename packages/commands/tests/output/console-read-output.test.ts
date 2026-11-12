import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
import datasetVersion from "../../src/commands/dataset/version.ts";
import datasetGroups from "../../src/commands/dataset/groups.ts";
import fileUrl from "../../src/commands/file/url.ts";
import deployInstances from "../../src/commands/deploy/instances.ts";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const datasetApi = "zeldaEasy.broadscope-platform.dataset.queryByDatasetId.m_efm";
const groupsApi = "zeldaEasy.broadscope-platform.datasetGroup.query.m_efm";
const versionsApi = "zeldaEasy.broadscope-platform.dataset.query.m_efm";
const fileApi = "zeldaEasy.bmp.ossRpcService.download";
const instancesApi =
  "zeldaEasy.broadscope-platform.modelInstance.listIndependentDeployedModel.m_efm";
const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
const retained = { future: { enabled: false, count: 0, missing: null, values: [] } };
const dataset = {
  datasetId: "fixture-version",
  datasetGroupId: "fixture-group",
  name: "Fixture dataset",
  data: { count: 0, optional: null },
  ...retained,
};
const version = {
  datasetId: "fixture-version",
  datasetGroupId: "fixture-group",
  releaseStatus: 0,
  datasetTaskDTO: { taskId: "fixture-import", taskStatus: 0, ...retained },
  ...retained,
};
const otherVersion = {
  ...version,
  datasetId: "fixture-other-version",
  fileId: "fixture-file",
  releaseStatus: 2,
};
const groupsPage = {
  records: [
    {
      datasetGroupId: "fixture-group",
      name: "Server-returned group",
      datasets: [otherVersion],
      ...retained,
    },
  ],
  items: 405,
  page: 2,
  itemsPerPage: 101,
  pageCount: 5,
  next: null,
  ...retained,
};
const matchedStatus = { state: "matched", release_status: "returned", import_status: "returned" };
const signedUrl =
  "https://files.example.invalid/fixture.jsonl?OSSAccessKeyId=fixture-id&Signature=fixture-signature&Expires=1234567890";
const fileResult = {
  url: signedUrl,
  expiresIn: 0,
  fileName: null,
  downloadable: false,
  ...retained,
};
const instancesPage = {
  records: [
    { modelServiceId: "fixture-service", status: 9876, replicas: 0, paused: false, ...retained },
  ],
  items: 405,
  itemsPerPage: 101,
  page: 2,
  pageCount: 5,
  next: null,
  ...retained,
};
const datasetRequest = { input: { datasetId: "fixture-version" } };
const versionRequest = {
  input: {
    datasetId: "fixture-version",
    datasetGroupId: "fixture-group",
    page: 1,
    itemsPerPage: 1,
    datasetTaskTypeList: [0],
    datasetTaskPageSize: 1,
  },
};
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  requests: Array<{ api: string; data: Record<string, unknown> }>;
  want: unknown;
}
const groupsScenario: Scenario = {
  name: "dataset groups second page with trimmed name",
  command: datasetGroups,
  flags: { page: 2, pageSize: 101, name: " \t Fixture group \t " },
  requests: [
    {
      api: groupsApi,
      data: {
        input: {
          datasetGroupPageNo: 2,
          datasetGroupPageSize: 101,
          name: "Fixture group",
          datasetPageSize: 1,
          datasetTaskTypeList: [0],
          datasetTaskPageSize: 1,
        },
      },
    },
  ],
  want: groupsPage,
};
const versionsScenario: Scenario = {
  name: "dataset version list by group from a raw array",
  command: datasetVersion,
  flags: { datasetGroupId: "fixture-group" },
  requests: [
    {
      api: versionsApi,
      data: {
        input: {
          datasetGroupId: "fixture-group",
          datasetTaskTypeList: [0],
          datasetTaskPageSize: 1,
        },
      },
    },
  ],
  want: { result: [otherVersion, version] },
};
const scenarios: Scenario[] = [
  {
    name: "dataset metadata by default",
    command: datasetVersion,
    flags: { datasetId: "fixture-version" },
    requests: [{ api: datasetApi, data: datasetRequest }],
    want: { dataset },
  },
  {
    name: "dataset with exact status",
    command: datasetVersion,
    flags: { datasetId: "fixture-version", includeStatus: true },
    requests: [
      { api: datasetApi, data: datasetRequest },
      { api: versionsApi, data: versionRequest },
    ],
    want: { dataset, version, status_query: matchedStatus },
  },
  {
    name: "file signed URL",
    command: fileUrl,
    flags: { fileKey: "fixture folder/object.jsonl" },
    requests: [{ api: fileApi, data: { fileKey: "fixture folder/object.jsonl" } }],
    want: fileResult,
  },
  {
    name: "deployment second page",
    command: deployInstances,
    flags: {
      page: 2,
      pageSize: 101,
      keyword: "fixture service",
      modelServiceId: "fixture-service",
    },
    requests: [
      {
        api: instancesApi,
        data: {
          input: {
            page: 2,
            itemsPerPage: 101,
            searchNameKeyword: "fixture service",
            modelServiceId: "fixture-service",
          },
        },
      },
    ],
    want: instancesPage,
  },
  groupsScenario,
  versionsScenario,
];
interface GatewayCall {
  url: URL;
  method: string | undefined;
  headers: Headers;
  form: URLSearchParams;
  api: string;
  version: string;
  data: Record<string, unknown>;
  cornerstone: Record<string, unknown>;
}
interface Display {
  format: "json" | "text";
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  workspaceId?: string;
  language?: "en-US" | "zh-CN";
}
let isolated: ReturnType<typeof enterIsolatedHome>;
let calls: GatewayCall[];
let payloads: Map<string, unknown>;
let rawResponses: Map<string, unknown>;
let transportFailure: { api: string; error: Error } | undefined;

beforeEach(() => {
  isolated = enterIsolatedHome();
  for (const name of [
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_ACCESS_TOKEN",
    "DASHSCOPE_BASE_URL",
    "BAILIAN_WORKSPACE_ID",
    "BAILIAN_ACCESS_KEY_ID",
    "BAILIAN_ACCESS_KEY_SECRET",
    "BAILIAN_SECURITY_TOKEN",
    "ALIBABA_CLOUD_ACCESS_KEY_ID",
    "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
    "ALIBABA_CLOUD_SECURITY_TOKEN",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "NODE_OPTIONS",
    "FORCE_COLOR",
    "DASHSCOPE_OUTPUT",
  ])
    vi.stubEnv(name, undefined);
  vi.stubEnv("NODE_USE_ENV_PROXY", "0");
  vi.stubEnv("DASHSCOPE_QUIET", "0");
  vi.stubEnv("DASHSCOPE_VERBOSE", "0");
  vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
  vi.stubEnv("DO_NOT_TRACK", "1");
  vi.stubEnv("NO_COLOR", "1");
  calls = [];
  payloads = new Map<string, unknown>([
    [
      workspaceApi,
      [
        { workspaceId: "fixture-unrelated", tenantId: "7654322" },
        { workspaceId: "fixture-workspace", tenantId: "7654321" },
      ],
    ],
    [datasetApi, dataset],
    [groupsApi, groupsPage],
    [versionsApi, [otherVersion, version]],
    [fileApi, fileResult],
    [instancesApi, instancesPage],
  ]);
  rawResponses = new Map();
  transportFailure = undefined;
  // Only the real Client's transport is replaced. Never contact an external service.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected unmocked HTTP"));
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    if (typeof init?.body !== "string") throw new Error("Expected form-encoded Console request");
    const form = new URLSearchParams(init.body);
    const params = JSON.parse(form.get("params")!) as {
      Api: string;
      V: string;
      Data: { cornerstoneParam: Record<string, unknown>; [key: string]: unknown };
    };
    const { cornerstoneParam, ...data } = params.Data;
    calls.push({
      url: new URL(input instanceof Request ? input.url : input),
      method: init.method,
      headers: new Headers(init.headers),
      form,
      api: params.Api,
      version: params.V,
      data,
      cornerstone: cornerstoneParam,
    });
    if (transportFailure?.api === params.Api) throw transportFailure.error;
    if (rawResponses.has(params.Api)) return Response.json(rawResponses.get(params.Api));
    if (!payloads.has(params.Api)) throw new Error(`Unexpected API: ${params.Api}`);
    const payload = payloads.get(params.Api);
    // Preserve the real gateway's metadata and workspace pagination shape;
    // simplified envelopes hid a production workspace-resolution regression.
    const responseData =
      params.Api === workspaceApi && Array.isArray(payload)
        ? { data: payload, maxResults: 100, totalCount: payload.length }
        : payload;
    return Response.json({
      code: "200",
      httpStatusCode: "200",
      requestId: "outer-request-fixture",
      successResponse: true,
      data: {
        success: true,
        httpStatus: 200,
        errorCode: "",
        errorMsg: "",
        api: params.Api,
        DataV2: {
          ret: ["SUCCESS::ok"],
          data: {
            code: "200",
            data: responseData,
            success: true,
            failed: false,
            requestId: "inner-request-fixture",
            httpStatusCode: 200,
          },
        },
      },
    });
  });
});
afterEach(() => {
  try {
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    isolated.restore();
  }
});

async function invoke(scenario: Scenario, display: Display = { format: "json" }) {
  let stdout = "";
  let stderr = "";
  let stdoutAtError: string | undefined;
  let thrown: unknown;
  const language = display.language ?? "en-US";
  const configPath = join(isolated.configDir, "config.json");
  const config = {
    language,
    telemetry: false,
    console_switch_agent: 111,
    ...(display.workspaceId ? { workspace_id: display.workspaceId } : {}),
  };
  const savedConfig = JSON.stringify(config);
  writeFileSync(configPath, savedConfig);
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
      consoleRegion: "cn-beijing",
      consoleSite: "domestic",
      consoleSwitchAgent: 111,
      workspaceId: display.workspaceId,
    },
    file: config,
    env: {},
    configPath,
  });
  const originalSettings = structuredClone(settings);
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text[language]);
  // Inject scoped streams into the real reporter; do not implement a CLI/global capture layer.
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
  const credential = {
    token: "fixture-console-token",
    source: "flag" as const,
    region: "cn-beijing",
    site: "domestic" as const,
    switchAgent: 111,
  };
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://api.example.invalid",
    ...(display.dryRun ? {} : { consoleCred: credential }),
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    await scenario.command.run({
      flags: scenario.flags,
      settings,
      identity,
      localize,
      client,
      output: reporter.output,
    } as never);
  } catch (error) {
    thrown = error;
    stdoutAtError = stdout;
    exitCode = reporter.error(error);
  }
  expect(settings).toEqual(originalSettings);
  expect(credential.switchAgent).toBe(111);
  expect(readFileSync(configPath, "utf8")).toBe(savedConfig);
  return { stdout, stderr, stdoutAtError, thrown, exitCode, client };
}

function diagnostics(stderr: string): Array<{ debug?: unknown; error: { message: string } }> {
  return stderr.trim()
    ? stderr
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
}
function expectGatewayCalls(scenario: Scenario, scoped = false) {
  const expected = [...(scoped ? [{ api: workspaceApi, data: {} }] : []), ...scenario.requests];
  expect(calls).toHaveLength(expected.length);
  for (const [index, request] of expected.entries()) {
    const call = calls[index]!;
    expect(call.method).toBe("POST");
    expect(call.url.origin).toBe("https://bailian-cs.console.aliyun.com");
    expect(call.url.pathname).toBe("/cli/api.json");
    expect(Object.fromEntries(call.url.searchParams)).toEqual({
      action: "BroadScopeAspnGateway",
      product: "sfm_bailian",
      api: request.api,
    });
    expect(call.headers.get("authorization")).toBe("Bearer fixture-console-token");
    expect(call.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(call.headers.get("accept")).toBe("*/*");
    expect([...call.form.keys()].sort()).toEqual(["params", "region"]);
    expect(call.form.get("region")).toBe("cn-beijing");
    expect(call.api).toBe(request.api);
    expect(call.version).toBe("1.0");
    expect(call.data).toEqual(request.data);
    expect(call.cornerstone).toEqual({
      protocol: "V2",
      console: "ONE_CONSOLE",
      productCode: "p_efm",
      switchUserType: 3,
      consoleSite: "BAILIAN_ALIYUN",
      switchAgent: scoped && index > 0 ? 7654321 : 111,
    });
  }
}
const displays = (["json", "text"] as const).flatMap((format) =>
  [false, true].flatMap((quiet) => [false, true].map((verbose) => ({ format, quiet, verbose }))),
);

for (const scenario of scenarios) {
  test.each(displays)(
    `${scenario.name} retains the full result and gateway protocol: %j`,
    async (display) => {
      const result = await invoke(scenario, display);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.thrown).toBeUndefined();
      // These commands deliberately render the same full JSON object as readable text.
      if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(scenario.want);
      else expect(result.stdout).toBe(JSON.stringify(scenario.want, null, 2) + "\n");
      if (display.verbose) {
        expect(result.stderr).not.toBe("");
        if (display.format === "json") {
          const records = diagnostics(result.stderr);
          expect(records.length).toBeGreaterThan(0);
          expect(records.every((record) => record.debug !== undefined)).toBe(true);
        }
      } else expect(result.stderr).toBe("");
      expect(result.stdout + result.stderr).not.toContain("fixture-console-token");
      expect(result.stderr).not.toContain(signedUrl);
      expect(result.stderr).not.toContain("fixture-signature");
      expect(result.stderr).not.toContain("OSSAccessKeyId");
      expectGatewayCalls(scenario);
    },
  );

  test(`${scenario.name} binds every request to the explicitly resolved workspace without mutating the original client`, async () => {
    const result = await invoke(scenario, { format: "json", workspaceId: "fixture-workspace" });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(scenario.want);
    expectGatewayCalls(scenario, true);
    // Reuse the original client: the per-invocation clone must not leak its tenant identity.
    await result.client.console(fileApi, { fileKey: "fixture-probe" });
    expect(calls.at(-1)!.cornerstone.switchAgent).toBe(111);
  });

  test.each(["none", "multiple"])(
    `${scenario.name} blocks %s workspace matches before business HTTP`,
    async (matches) => {
      payloads.set(
        workspaceApi,
        matches === "none"
          ? [{ workspaceId: "fixture-unrelated", tenantId: "7654321" }]
          : [
              { workspaceId: "fixture-workspace", tenantId: "7654321" },
              { workspaceId: "fixture-workspace", tenantId: "7654322" },
            ],
      );
      const result = await invoke(scenario, { format: "json", workspaceId: "fixture-workspace" });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(calls.map((call) => call.api)).toEqual([workspaceApi]);
      expect(calls[0]!.cornerstone.switchAgent).toBe(111);
      expect(diagnostics(result.stderr)).toHaveLength(1);
      expect(diagnostics(result.stderr)[0]!.error.message).toContain("Cannot uniquely resolve");
    },
  );

  test(`${scenario.name} dry-run never resolves workspace or credentials`, async () => {
    const result = await invoke(scenario, {
      format: "json",
      dryRun: true,
      workspaceId: "fixture-workspace",
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(calls).toEqual([]);
    const preview = JSON.parse(result.stdout);
    if (scenario.command === datasetVersion) {
      expect(preview).toMatchObject({
        action: "dataset.version",
        api: scenario.requests[0]!.api,
        data: scenario.requests[0]!.data,
      });
      if (scenario.flags.datasetGroupId) expect(preview).not.toHaveProperty("status_query");
    }
    expect(preview).toMatchObject({
      consoleRegion: "cn-beijing",
      consoleSite: "domestic",
      workspaceIdentity: {
        api: workspaceApi,
        workspaceId: "fixture-workspace",
        switchAgentFrom: "tenantId",
      },
    });
    expect(preview).not.toHaveProperty("consoleSwitchAgent");
    expect(result.stderr).toBe("");
  });
}

test("deployment empty second page retains records/items and all unknown falsy metadata", async () => {
  const response = { ...instancesPage, records: [], items: 0, pageCount: 0 };
  payloads.set(instancesApi, response);
  const result = await invoke(scenarios[3]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(response);
  expectGatewayCalls(scenarios[3]!);
});

test("dataset groups defaults send no name or type filters and fetch only one page", async () => {
  const response = { ...groupsPage, page: 1, itemsPerPage: 10, pageCount: 41 };
  payloads.set(groupsApi, response);
  const scenario: Scenario = {
    ...groupsScenario,
    flags: {},
    requests: [
      {
        api: groupsApi,
        data: {
          input: {
            datasetGroupPageNo: 1,
            datasetGroupPageSize: 10,
            datasetPageSize: 1,
            datasetTaskTypeList: [0],
            datasetTaskPageSize: 1,
          },
        },
      },
    ],
    want: response,
  };
  const result = await invoke(scenario);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(response);
  expectGatewayCalls(scenario);
});

test.each([
  {
    name: "empty group page",
    response: { ...groupsPage, records: [], items: 0, pageCount: 0 },
  },
  {
    name: "group with no version preview",
    response: {
      ...groupsPage,
      records: [{ ...groupsPage.records[0]!, datasets: [] }],
    },
  },
])("dataset groups accepts $name without discarding metadata", async ({ response }) => {
  payloads.set(groupsApi, response);
  const result = await invoke(groupsScenario, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(response);
  expect(result.stderr).toBe("");
  expectGatewayCalls(groupsScenario);
});

test.each(["array", "object"])(
  "dataset version group query preserves Console IDs, optional file IDs and unknown fields (%s)",
  async (shape) => {
    const withoutGroup = { datasetId: "fixture-version-without-group", ...retained };
    const records = [otherVersion, version, withoutGroup];
    const response =
      shape === "array" ? records : { result: records, items: 3, next: null, ...retained };
    payloads.set(versionsApi, response);
    const result = await invoke(versionsScenario, { format: "json", quiet: true });
    expect(result.exitCode, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual(shape === "array" ? { result: records } : response);
    expect(output.result[0]).toMatchObject({
      datasetId: "fixture-other-version",
      datasetGroupId: "fixture-group",
      fileId: "fixture-file",
    });
    expect(output.result[1]).toMatchObject({
      datasetId: "fixture-version",
      datasetGroupId: "fixture-group",
    });
    expect(output.result[1]).not.toHaveProperty("fileId");
    expect(output.result[2]).not.toHaveProperty("fileId");
    expect(output.result[2]).not.toHaveProperty("datasetGroupId");
    expect(result.stderr).toBe("");
    expectGatewayCalls(versionsScenario);
  },
);

test.each(["array", "object"])(
  "dataset version group query accepts an empty %s list without filling missing fields",
  async (shape) => {
    const response = shape === "array" ? [] : { result: [], items: 0, ...retained };
    payloads.set(versionsApi, response);
    const result = await invoke(versionsScenario);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(shape === "array" ? { result: [] } : response);
    expect(result.stderr).toBe("");
    expectGatewayCalls(versionsScenario);
  },
);

test.each(["array", "object"])(
  "dataset version group query rejects a wrong group anywhere in the %s list without partial output",
  async (shape) => {
    const records = [version, { ...otherVersion, datasetGroupId: "fixture-wrong-group" }];
    payloads.set(versionsApi, shape === "array" ? records : { result: records, ...retained });
    const result = await invoke(versionsScenario);
    expect(result.exitCode).toBe(1);
    expect(result.thrown).toBeInstanceOf(BailianError);
    expect(result.stdout).toBe("");
    expect(result.stdoutAtError).toBe("");
    const errors = diagnostics(result.stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error.message).toContain("another dataset group");
    expectGatewayCalls(versionsScenario);
  },
);

test.each([
  { name: "missing result array", response: { items: 0, ...retained } },
  { name: "non-array result", response: { result: {}, ...retained } },
  { name: "null array entry", response: [version, null] },
  { name: "primitive result entry", response: { result: [version, 0], ...retained } },
  { name: "nested array entry", response: [version, []] },
  {
    name: "missing version ID",
    response: { result: [version, { datasetGroupId: "fixture-group" }], ...retained },
  },
  { name: "empty version ID", response: [version, { ...otherVersion, datasetId: "" }] },
  {
    name: "whitespace version ID",
    response: { result: [version, { ...otherVersion, datasetId: " \t " }], ...retained },
  },
  { name: "non-string version ID", response: [version, { ...otherVersion, datasetId: 123 }] },
])("dataset version group query rejects $name without partial output", async ({ response }) => {
  payloads.set(versionsApi, response);
  const result = await invoke(versionsScenario);
  expect(result.exitCode).toBe(1);
  expect(result.thrown).toBeInstanceOf(BailianError);
  expect(result.stdout).toBe("");
  expect(result.stdoutAtError).toBe("");
  const errors = diagnostics(result.stderr);
  expect(errors).toHaveLength(1);
  expect(errors[0]!.error.message).toContain("Console dataset version");
  expectGatewayCalls(versionsScenario);
});

test("dataset include-status retains exact matching for the legacy result object", async () => {
  payloads.set(versionsApi, { result: [otherVersion, version], items: 2 });
  const result = await invoke(scenarios[1]!);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(scenarios[1]!.want);
  expectGatewayCalls(scenarios[1]!);
});

test("dataset include-status cannot fall back to result[0] when no ID matches", async () => {
  payloads.set(versionsApi, { result: [otherVersion], items: 1 });
  const result = await invoke(scenarios[1]!);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    dataset,
    version: null,
    status_query: {
      state: "unavailable",
      reason: "no_exact_match_in_response",
      release_status: "missing",
      import_status: "missing",
    },
  });
  expectGatewayCalls(scenarios[1]!);
});

test.each([undefined, "", " \t "])(
  "dataset group %j makes status explicitly unavailable with no second API",
  async (datasetGroupId) => {
    const metadata = { ...dataset, datasetGroupId };
    payloads.set(datasetApi, metadata);
    const result = await invoke(scenarios[1]!);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      dataset: JSON.parse(JSON.stringify(metadata)),
      version: null,
      status_query: { state: "unavailable", reason: "missing_dataset_group_id" },
    });
    expectGatewayCalls(scenarios[0]!);
  },
);

test.each([
  { releaseStatus: 3, taskStatus: 10 },
  { releaseStatus: 9876, taskStatus: 8765 },
])("failed or unknown resource states stay raw and do not fail the query: %j", async (state) => {
  const returnedVersion = {
    ...version,
    releaseStatus: state.releaseStatus,
    datasetTaskDTO: {
      ...version.datasetTaskDTO,
      taskStatus: state.taskStatus,
      errorMsg: "original import failure",
    },
    errorMsg: "original release failure",
  };
  payloads.set(versionsApi, { result: [returnedVersion] });
  const result = await invoke(scenarios[1]!, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.thrown).toBeUndefined();
  expect(JSON.parse(result.stdout)).toEqual({
    dataset,
    version: returnedVersion,
    status_query: matchedStatus,
  });
  expect(result.stderr).toBe("");
  expectGatewayCalls(scenarios[1]!);
});

test.each(["json", "text"] as const)(
  "second request exception preserves metadata before propagating the same error (%s)",
  async (format) => {
    const originalError = new Error("original fixture second-request failure");
    transportFailure = { api: versionsApi, error: originalError };
    const result = await invoke(scenarios[1]!, {
      format,
      quiet: true,
      workspaceId: "fixture-workspace",
    });
    expect(result.exitCode).toBe(1);
    expect(result.thrown).toBe(originalError);
    expect(result.stdoutAtError).toBe(result.stdout);
    expect(JSON.parse(result.stdoutAtError!)).toEqual({
      dataset,
      version: null,
      status_query: { state: "failed" },
    });
    if (format === "json") {
      expect(diagnostics(result.stderr)).toHaveLength(1);
      expect(diagnostics(result.stderr)[0]!.error.message).toBe(originalError.message);
    } else expect(result.stderr).toContain(originalError.message);
    expectGatewayCalls(scenarios[1]!, true);
  },
);

test("dataset NotFound from the observed DataV2 error shape is not replaced by metadata validation", async () => {
  rawResponses.set(datasetApi, {
    successResponse: true,
    requestId: "fixture-not-found-request",
    data: {
      success: true,
      DataV2: {
        ret: ["SUCCESS::ok"],
        data: {
          codeEnum: "Train.NotFound.Data",
          code: "10130404",
          success: false,
          appName: "fixture-app",
          __statusCode__: 404,
          message: "找不到相关数据",
        },
      },
    },
  });
  const result = await invoke(scenarios[0]!, { format: "json", workspaceId: "fixture-workspace" });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(diagnostics(result.stderr)[0]!.error.message).toContain("找不到相关数据");
  expect(result.stderr).not.toContain("no usable metadata");
  expect((result.thrown as BailianError).api).toEqual({
    httpStatus: 200,
    apiCode: "10130404",
    requestId: "fixture-not-found-request",
  });
  expectGatewayCalls(scenarios[0]!, true);
});

for (const scenario of scenarios) {
  test(`${scenario.name} does not turn a nested service rejection into an empty success`, async () => {
    const rejectedApi = scenario.requests.at(-1)!.api;
    rawResponses.set(rejectedApi, {
      data: {
        requestId: "fixture-rejected-request",
        DataV2: {
          data: {
            success: false,
            errorCode: "Fixture.OriginalRejected",
            errorMsg: "原始服务错误 / original service rejection",
            data: null,
          },
        },
      },
    });
    const result = await invoke(scenario, { format: "json", quiet: true });
    expect(result.exitCode).toBe(1);
    expect(result.thrown).toBeInstanceOf(BailianError);
    expect((result.thrown as BailianError).api).toEqual({
      httpStatus: 200,
      apiCode: "Fixture.OriginalRejected",
      requestId: "fixture-rejected-request",
    });
    const errors = diagnostics(result.stderr);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error.message).toContain("原始服务错误 / original service rejection");
    if (scenario.flags.includeStatus) {
      expect(JSON.parse(result.stdout)).toEqual({
        dataset,
        version: null,
        status_query: { state: "failed" },
      });
    } else expect(result.stdout).toBe("");
    expectGatewayCalls(scenario);
  });
}
