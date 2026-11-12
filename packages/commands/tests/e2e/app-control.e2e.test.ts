import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { httpTransport } from "bailian-cli-core";
import { buildIsolatedCliEnv } from "e2e/isolation";
import {
  isConsoleE2EReady,
  parseStdoutJson,
  runCommandE2e,
  runCommandHelp,
  runCommandInProcess,
  runConsoleCommandE2e,
} from "./helpers.ts";
import { APP_CONTROL_ROUTES } from "./topic-routes.ts";
import {
  APP_CONTROL_CREATE_API,
  APP_CONTROL_DELETE_API,
  APP_CONTROL_DETAIL_API,
  APP_CONTROL_LIST_API,
  APP_CONTROL_UPDATE_API,
  APP_DATA_CREATE_DRAFT_API,
  APP_DATA_GET_API,
  APP_DATA_UPDATE_DRAFT_API,
  FLOW_GET_CONFIG_API,
  FLOW_PUBLISH_API,
  FLOW_SAVE_API,
} from "../../src/commands/app/shared.ts";

// Offline only: real Console credentials and online acceptance are deliberately not used.
const offlineEnvironment: NodeJS.ProcessEnv = {
  DASHSCOPE_API_KEY: undefined,
  DASHSCOPE_ACCESS_TOKEN: undefined,
  DASHSCOPE_BASE_URL: undefined,
  BAILIAN_ACCESS_KEY_ID: undefined,
  BAILIAN_ACCESS_KEY_SECRET: undefined,
  BAILIAN_SECURITY_TOKEN: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
  ALIBABA_CLOUD_SECURITY_TOKEN: undefined,
  BAILIAN_WORKSPACE_ID: undefined,
  DASHSCOPE_OUTPUT: undefined,
  DASHSCOPE_VERBOSE: "0",
  DASHSCOPE_QUIET: "0",
  HTTP_PROXY: undefined,
  HTTPS_PROXY: undefined,
  ALL_PROXY: undefined,
  NO_PROXY: undefined,
  http_proxy: undefined,
  https_proxy: undefined,
  all_proxy: undefined,
  no_proxy: undefined,
  NODE_USE_ENV_PROXY: "0",
  NODE_OPTIONS: undefined,
  NO_UPDATE_NOTIFIER: "1",
  DO_NOT_TRACK: "1",
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
};

interface GatewayRequest {
  Api: string;
  Data: Record<string, unknown>;
}

/** Mock the console gateway; record requests and reply with a DataV2 envelope. */
function mockConsole(responses: Record<string, unknown>): GatewayRequest[] {
  const requests: GatewayRequest[] = [];
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (_url, init) => {
    if (typeof init?.body !== "string") throw new Error("Expected a console gateway form body.");
    const body = new URLSearchParams(init.body);
    const request = JSON.parse(body.get("params") ?? "{}") as GatewayRequest;
    requests.push(request);
    if (!(request.Api in responses)) throw new Error(`Unexpected console API: ${request.Api}`);
    const payload = responses[request.Api];
    return new Response(JSON.stringify({ data: { DataV2: { data: { data: payload } } } }));
  });
  return requests;
}

function writeConfig(configDir: string, body: Record<string, unknown>): void {
  writeFileSync(join(configDir, "config.json"), JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Offline contracts: help, validation, static dry-run (zero requests), risk gate
// ---------------------------------------------------------------------------

describe("e2e: app control offline contracts", () => {
  let isolated: ReturnType<typeof buildIsolatedCliEnv>;

  beforeEach(() => {
    isolated = buildIsolatedCliEnv({ overrides: offlineEnvironment });
    writeConfig(isolated.env.BAILIAN_CONFIG_DIR!, { language: "en-US", telemetry: false });
    vi.spyOn(httpTransport, "fetch").mockRejectedValue(new Error("Unexpected Console HTTP"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected offline HTTP"));
  });
  afterEach(() => {
    try {
      expect(httpTransport.fetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      isolated.dispose();
    }
  });

  function offline(args: string[]) {
    return runCommandInProcess(APP_CONTROL_ROUTES, args, {
      ...isolated.env,
      ...offlineEnvironment,
    });
  }

  const leaves = [
    { path: "app create", flags: ["--name", "--type", "--config-json", "--config-file"] },
    { path: "app get", flags: ["--app-id", "--type", "--scope", "--agent-version"] },
    { path: "app update", flags: ["--app-id", "--name", "--model", "--instructions"] },
    { path: "app publish", flags: ["--app-id", "--description"] },
    { path: "app delete", flags: ["--app-id", "--yes"] },
    { path: "app copy", flags: ["--app-id"] },
    { path: "app versions", flags: ["--app-id", "--type"] },
    { path: "app workflow get", flags: ["--app-id", "--flow-version", "--output-file"] },
    {
      path: "app workflow save",
      flags: ["--app-id", "--config-json", "--config-file", "--flow-version"],
    },
    { path: "app workflow publish", flags: ["--app-id", "--description", "--trigger-list"] },
    { path: "app workflow export", flags: ["--app-id", "--flow-version", "--output-file"] },
  ];

  test.each(leaves)("$path help exposes Console scope flags", async (leaf) => {
    const result = await runCommandHelp(APP_CONTROL_ROUTES, [...leaf.path.split(" "), "--help"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain(`bl ${leaf.path}`);
    for (const flag of [
      ...leaf.flags,
      "--console-region",
      "--console-site",
      "--console-switch-agent",
      "--workspace-id",
    ]) {
      expect(result.stderr).toContain(flag);
    }
  });

  const missingRequired = [
    { path: "app create", args: [] as string[] },
    { path: "app get", args: [] },
    { path: "app update", args: [] },
    { path: "app publish", args: [] },
    { path: "app delete", args: [] },
    { path: "app copy", args: [] },
    { path: "app versions", args: [] },
    { path: "app workflow get", args: [] },
    { path: "app workflow save", args: [] },
    { path: "app workflow publish", args: [] },
    { path: "app workflow export", args: [] },
  ];

  test.each(missingRequired)("$path without required flags exits 2", async (scenario) => {
    const result = await offline([
      ...scenario.path.split(" "),
      ...scenario.args,
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
  });

  test("app create rejects invalid --config-json JSON", async () => {
    const result = await offline([
      "app",
      "create",
      "--name",
      "x",
      "--config-json",
      "{not json",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(JSON.parse(result.stderr).error.message).toMatch(/valid JSON/i);
  });

  test("app create rejects --config-json together with --config-file", async () => {
    const result = await offline([
      "app",
      "create",
      "--name",
      "x",
      "--config-json",
      "{}",
      "--config-file",
      "c.json",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(JSON.parse(result.stderr).error.message).toMatch(/mutually exclusive/i);
  });

  test("app create workflow rejects --model", async () => {
    const result = await offline([
      "app",
      "create",
      "--name",
      "x",
      "--type",
      "workflow",
      "--model",
      "qwen3-max",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(JSON.parse(result.stderr).error.message).toMatch(/workflow save/i);
  });

  test("app update requires at least one changed field", async () => {
    const result = await offline([
      "app",
      "update",
      "--app-id",
      "abc",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(JSON.parse(result.stderr).error.message).toMatch(/at least one/i);
  });

  test("app get workflow rejects --agent-version", async () => {
    const result = await offline([
      "app",
      "get",
      "--app-id",
      "abc",
      "--type",
      "workflow",
      "--agent-version",
      "3",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
  });

  test("app workflow save requires --config-json or --config-file", async () => {
    const result = await offline([
      "app",
      "workflow",
      "save",
      "--app-id",
      "abc",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(JSON.parse(result.stderr).error.message).toMatch(/--config/);
  });

  const staticDryRuns = [
    {
      name: "create agent",
      args: ["app", "create", "--name", "Demo"],
      api: APP_CONTROL_CREATE_API,
    },
    {
      name: "create workflow",
      args: ["app", "create", "--name", "Flow", "--type", "workflow"],
      api: APP_DATA_CREATE_DRAFT_API,
    },
    {
      name: "get agent",
      args: ["app", "get", "--app-id", "abc"],
      api: APP_CONTROL_DETAIL_API,
    },
    {
      name: "publish agent",
      args: ["app", "publish", "--app-id", "abc"],
      api: "zeldaEasy.broadscope-bailian.app-control.publish",
    },
    {
      name: "delete agent",
      args: ["app", "delete", "--app-id", "abc"],
      api: APP_CONTROL_DELETE_API,
    },
    {
      name: "copy agent",
      args: ["app", "copy", "--app-id", "abc"],
      api: "zeldaEasy.broadscope-bailian.app-control.copy",
    },
    {
      name: "versions agent",
      args: ["app", "versions", "--app-id", "abc"],
      api: "zeldaEasy.broadscope-bailian.app-control.getAgentVersionList",
    },
    {
      name: "workflow get",
      args: ["app", "workflow", "get", "--app-id", "abc"],
      api: FLOW_GET_CONFIG_API,
    },
    {
      name: "workflow export",
      args: ["app", "workflow", "export", "--app-id", "abc"],
      api: "zeldaEasy.broadscope-bailian.app-orchestra-flow.generateDSLSchema",
    },
  ];

  test.each(staticDryRuns)(
    "$name --dry-run previews the API with zero requests",
    async (scenario) => {
      const result = await offline([...scenario.args, "--dry-run", "--output", "json"]);
      expect(result.exitCode, result.stderr).toBe(0);
      const data = parseStdoutJson<{ api: string; data: Record<string, unknown> }>(result.stdout);
      expect(data.api).toBe(scenario.api);
      expect(data.data).toBeDefined();
    },
  );

  test("app list --type workflow uses exclusion filter", async () => {
    const result = await offline([
      "app",
      "list",
      "--type",
      "workflow",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ api: string; data: { reqDTO: Record<string, unknown> } }>(
      result.stdout,
    );
    expect(data.api).toBe(APP_CONTROL_LIST_API);
    expect(data.data.reqDTO.notInTypes).toEqual([5, 8, 10]);
    expect(data.data.reqDTO.type).toBeUndefined();
  });

  test("app list default keeps agent filter", async () => {
    const result = await offline(["app", "list", "--dry-run", "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ data: { reqDTO: Record<string, unknown> } }>(result.stdout);
    expect(data.data.reqDTO.type).toBe(5);
    expect(data.data.reqDTO.notInTypes).toEqual([10]);
  });

  test("app delete without --yes requires confirmation (exit 7)", async () => {
    const result = await offline(["app", "delete", "--app-id", "abc", "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(7);
    const error = JSON.parse(result.stderr).error;
    expect(error.type).toBe("requires_confirmation");
  });
});

// ---------------------------------------------------------------------------
// Mocked console: request payloads, read-modify-write planning, response unwrap
// ---------------------------------------------------------------------------

describe("e2e: app control mocked console", () => {
  let isolated: ReturnType<typeof buildIsolatedCliEnv>;

  beforeEach(() => {
    isolated = buildIsolatedCliEnv({ overrides: offlineEnvironment });
    writeConfig(isolated.env.BAILIAN_CONFIG_DIR!, {
      language: "en-US",
      telemetry: false,
      access_token: "test-console-token",
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    isolated.dispose();
  });

  function run(args: string[]) {
    return runCommandInProcess(APP_CONTROL_ROUTES, args, {
      ...isolated.env,
      ...offlineEnvironment,
    });
  }

  test("app create agent sends default config and extracts the app code", async () => {
    const requests = mockConsole({ [APP_CONTROL_CREATE_API]: { result: "app-new-123" } });
    const result = await run([
      "app",
      "create",
      "--name",
      "Demo",
      "--model",
      "qwen3-max",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests).toHaveLength(1);
    const reqDTO = requests[0]!.Data.reqDTO as Record<string, unknown>;
    expect(reqDTO.name).toBe("Demo");
    expect(reqDTO.type).toBe(5);
    expect(reqDTO.source).toBe("console");
    const config = reqDTO.config as Record<string, unknown>;
    expect(config.model).toBe("qwen3-max");
    expect(config.dialog_round).toBe(3);
    const data = parseStdoutJson<{ app_code: string }>(result.stdout);
    expect(data.app_code).toBe("app-new-123");
  });

  test("app update agent dry-run reads the draft and previews merged config (no write)", async () => {
    const requests = mockConsole({
      [APP_CONTROL_DETAIL_API]: {
        code: "abc",
        name: "Old",
        config: { model: "auto", dialog_round: 3 },
      },
    });
    const result = await run([
      "app",
      "update",
      "--app-id",
      "abc",
      "--model",
      "qwen3-max",
      "--instructions",
      "Be helpful",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    // Only the read-only detail call; the update write must not happen.
    expect(requests.map((request) => request.Api)).toEqual([APP_CONTROL_DETAIL_API]);
    const data = parseStdoutJson<{ api: string; data: { reqDTO: Record<string, unknown> } }>(
      result.stdout,
    );
    expect(data.api).toBe(APP_CONTROL_UPDATE_API);
    const config = data.data.reqDTO.config as Record<string, unknown>;
    expect(config.model).toBe("qwen3-max");
    expect(config.instruction).toBe("Be helpful");
    expect(config.dialog_round).toBe(3);
  });

  test("app update agent merges current config and writes once", async () => {
    const requests = mockConsole({
      [APP_CONTROL_DETAIL_API]: { code: "abc", config: { model: "auto", dialog_round: 5 } },
      [APP_CONTROL_UPDATE_API]: { result: true },
    });
    const result = await run([
      "app",
      "update",
      "--app-id",
      "abc",
      "--config-json",
      '{"max_loop":10}',
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests.map((request) => request.Api)).toEqual([
      APP_CONTROL_DETAIL_API,
      APP_CONTROL_UPDATE_API,
    ]);
    const reqDTO = requests[1]!.Data.reqDTO as Record<string, unknown>;
    const config = reqDTO.config as Record<string, unknown>;
    expect(config.dialog_round).toBe(5);
    expect(config.max_loop).toBe(10);
    expect(config.model).toBe("auto");
  });

  test("app update workflow reads the DTO and writes metadata back", async () => {
    const requests = mockConsole({
      [APP_DATA_GET_API]: { code: "abc", name: "Old", appDescription: "old desc", type: 7 },
      [APP_DATA_UPDATE_DRAFT_API]: { result: true },
    });
    const result = await run([
      "app",
      "update",
      "--app-id",
      "abc",
      "--type",
      "workflow",
      "--name",
      "New",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests.map((request) => request.Api)).toEqual([
      APP_DATA_GET_API,
      APP_DATA_UPDATE_DRAFT_API,
    ]);
    const reqDTO = requests[1]!.Data.reqDTO as Record<string, unknown>;
    expect(reqDTO.name).toBe("New");
    expect(reqDTO.appDescription).toBe("old desc");
    expect(reqDTO.type).toBe(7);
  });

  test("app workflow save dry-run resolves version with a read only", async () => {
    const requests = mockConsole({
      [FLOW_GET_CONFIG_API]: { config: '{"nodes":[]}', version: "7" },
    });
    const result = await run([
      "app",
      "workflow",
      "save",
      "--app-id",
      "abc",
      "--config-json",
      '{"nodes":[1]}',
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests.map((request) => request.Api)).toEqual([FLOW_GET_CONFIG_API]);
    const data = parseStdoutJson<{ api: string; data: Record<string, unknown> }>(result.stdout);
    expect(data.api).toBe(FLOW_SAVE_API);
    expect(data.data.version).toBe("7");
    expect(data.data.config).toBe('{"nodes":[1]}');
  });

  test("app workflow save writes the canvas with the resolved version", async () => {
    const requests = mockConsole({
      [FLOW_GET_CONFIG_API]: { config: '{"nodes":[]}', version: "7" },
      [FLOW_SAVE_API]: { result: true },
    });
    const result = await run([
      "app",
      "workflow",
      "save",
      "--app-id",
      "abc",
      "--config-json",
      '{"nodes":[1]}',
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests.map((request) => request.Api)).toEqual([FLOW_GET_CONFIG_API, FLOW_SAVE_API]);
    expect(requests[1]!.Data.version).toBe("7");
    expect(requests[1]!.Data.appCode).toBe("abc");
  });

  test("app workflow publish normalizes triggers from the draft", async () => {
    const draftTriggers = [
      { flowName: "keep", uiConfig: '{"type":"webhook"}', parameters: [] },
      { flowName: "drop", uiConfig: '{"type":"none"}', parameters: [] },
    ];
    const requests = mockConsole({
      [FLOW_GET_CONFIG_API]: {
        config: '{"nodes":[]}',
        version: "9",
        applicationDTO: { applicationConfigDTO: { triggerList: draftTriggers } },
      },
      [FLOW_PUBLISH_API]: { result: true },
    });
    const result = await run([
      "app",
      "workflow",
      "publish",
      "--app-id",
      "abc",
      "--description",
      "v2",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests.map((request) => request.Api)).toEqual([FLOW_GET_CONFIG_API, FLOW_PUBLISH_API]);
    const publishData = requests[1]!.Data;
    expect(publishData.version).toBe("9");
    expect(publishData.description).toBe("v2");
    const triggerList = publishData.triggerList as Array<Record<string, unknown>>;
    expect(triggerList).toHaveLength(1);
    expect(triggerList[0]!.flowName).toBe("keep");
    expect(triggerList[0]!.uiConfig).toBeUndefined();
  });

  test("app delete --yes enters run and calls the delete API", async () => {
    const requests = mockConsole({ [APP_CONTROL_DELETE_API]: { result: true } });
    const result = await run(["app", "delete", "--app-id", "abc", "--yes", "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests.map((request) => request.Api)).toEqual([APP_CONTROL_DELETE_API]);
    expect((requests[0]!.Data.reqDTO as Record<string, unknown>).code).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// Representative subprocess coverage (shell / stdio / exit-code contract)
// ---------------------------------------------------------------------------

describe("e2e: app control subprocess", () => {
  test("app create --dry-run previews via a real subprocess", async () => {
    const result = await runCommandE2e(
      APP_CONTROL_ROUTES,
      ["app", "create", "--name", "Demo", "--dry-run", "--output", "json"],
      { ...offlineEnvironment, BAILIAN_E2E: "0" },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ api: string }>(result.stdout);
    expect(data.api).toBe(APP_CONTROL_CREATE_API);
  });

  test("app delete confirmation gate via a real subprocess (exit 7)", async () => {
    const result = await runCommandE2e(
      APP_CONTROL_ROUTES,
      ["app", "delete", "--app-id", "abc", "--output", "json"],
      { ...offlineEnvironment, BAILIAN_E2E: "0" },
    );
    expect(result.exitCode, result.stderr).toBe(7);
    expect(JSON.parse(result.stderr).error.type).toBe("requires_confirmation");
  });
});

// ---------------------------------------------------------------------------
// Live integration (gated; requires a real console session)
// ---------------------------------------------------------------------------

describe.skipIf(!isConsoleE2EReady())("e2e: app control live (Console)", () => {
  test("app list returns a structured page", async () => {
    const result = await runConsoleCommandE2e(APP_CONTROL_ROUTES, [
      "app",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ total: number; apps: unknown[] }>(result.stdout);
    expect(Array.isArray(data.apps)).toBe(true);
  }, 60_000);
});
