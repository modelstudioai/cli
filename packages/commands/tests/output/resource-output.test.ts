import { spawn } from "child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  buildSettings,
  Client,
  ExitCode,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import memoryAdd from "../../src/commands/memory/add.ts";
import memoryDelete from "../../src/commands/memory/delete.ts";
import memoryList from "../../src/commands/memory/list.ts";
import memorySearch from "../../src/commands/memory/search.ts";
import memoryUpdate from "../../src/commands/memory/update.ts";
import profileCreate from "../../src/commands/memory/profile-create.ts";
import profileGet from "../../src/commands/memory/profile-get.ts";
import quotaCheck from "../../src/commands/quota/check.ts";
import quotaDelete from "../../src/commands/quota/delete.ts";
import quotaHistory from "../../src/commands/quota/history.ts";
import quotaList from "../../src/commands/quota/list.ts";
import quotaUpdate from "../../src/commands/quota/update.ts";
import securityOverview from "../../src/commands/security/overview.ts";
import securityAlerts from "../../src/commands/security/alerts.ts";

interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  response: unknown;
  want: unknown;
  text: string;
}
const node = { memory_node_id: "node-test", content: "Hello memory", score: 0.9 };
const limits = {
  model: "qwen-test",
  model_limit: {
    request_limit: 60,
    request_limit_period: 60,
    usage_limit: 1000,
    usage_limit_period: 60,
  },
};
const overview = {
  capabilities: [{ key: "content_safety", enabled: true, count: 3 }],
  protection: [],
  content_safety: { hit: 1, scanned: 10 },
};
const alerts = {
  stats: { total: 1, high: 1, medium: 0, low: 0 },
  data: [
    {
      alert_id: "alert-test",
      risk_level: "high",
      risk_name: "Risk",
      asset_name: "asset",
      app_name: "app",
      asset_type: "agent",
      status: "unhandled",
      source: "src",
      check_time: "invalid",
      risk_desc: "Details",
    },
  ],
  next_page: "next-cursor",
};
const cases: Scenario[] = [
  {
    name: "memory add",
    command: memoryAdd,
    flags: {
      userId: "user-test",
      content: "Hello",
      memoryLibraryId: "lib-test",
      profileSchema: "schema-test",
    },
    response: { memory_ids: ["node-test"], request_id: "request-test" },
    want: { memory_ids: ["node-test"], request_id: "request-test" },
    text: "Memory added. IDs: node-test\n",
  },
  {
    name: "memory delete",
    command: memoryDelete,
    flags: { userId: "user-test", nodeId: "node-test", memoryLibraryId: "lib-test" },
    response: { request_id: "request-test" },
    want: { request_id: "request-test" },
    text: "Memory node node-test deleted.\n",
  },
  {
    name: "memory list",
    command: memoryList,
    flags: { userId: "user-test", page: 2, pageSize: 3, memoryLibraryId: "lib-test" },
    response: { memory_nodes: [node], total: 9, request_id: "request-test" },
    want: { memory_nodes: [node], total: 9, request_id: "request-test" },
    text: "[node-test] Hello memory\n\nTotal: 9\n",
  },
  {
    name: "memory search",
    command: memorySearch,
    flags: { userId: "user-test", query: "Hello", topK: 3, memoryLibraryId: "lib-test" },
    response: { memory_nodes: [node], request_id: "request-test" },
    want: { memory_nodes: [node], request_id: "request-test" },
    text: "[node-test] Hello memory\n",
  },
  {
    name: "memory update",
    command: memoryUpdate,
    flags: {
      userId: "user-test",
      nodeId: "node-test",
      content: "New",
      memoryLibraryId: "lib-test",
    },
    response: { request_id: "request-test" },
    want: { request_id: "request-test" },
    text: "Memory node node-test updated.\n",
  },
  {
    name: "profile create",
    command: profileCreate,
    flags: { name: "schema-test", description: "Demo", attributes: '[{"name":"hobby"}]' },
    response: { profile_schema_id: "schema-test", request_id: "request-test" },
    want: { profile_schema_id: "schema-test", request_id: "request-test" },
    text: "Profile schema created: schema-test\n",
  },
  {
    name: "profile get",
    command: profileGet,
    flags: { userId: "user-test", schemaId: "schema-test" },
    response: {
      profile: {
        attributes: [
          { name: "hobby", value: "reading" },
          { name: "empty", value: null },
        ],
      },
      request_id: "request-test",
    },
    want: {
      profile: {
        attributes: [
          { name: "hobby", value: "reading" },
          { name: "empty", value: null },
        ],
      },
      request_id: "request-test",
    },
    text: "hobby: reading\nempty: (empty)\n",
  },
  {
    name: "quota check",
    command: quotaCheck,
    flags: { period: "2" },
    response: {},
    want: [
      {
        model: "qwen-test",
        rpmUsage: 12,
        rpmLimit: 60,
        tpmUsage: 100,
        tpmLimit: 1000,
        rpmQuotaLeft: 80,
        tpmQuotaLeft: 90,
        rpmQuotaLabel: "80.0%",
        tpmQuotaLabel: "90.0%",
      },
    ],
    text: "qwen-test",
  },
  {
    name: "quota delete",
    command: quotaDelete,
    flags: { model: "qwen-test" },
    response: { request_id: "request-test" },
    want: { model: "qwen-test", request_id: "request-test" },
    text: 'Rate limits cleared for "qwen-test".\n',
  },
  {
    name: "quota history",
    command: quotaHistory,
    flags: { page: "2", pageSize: "3" },
    response: {},
    want: {
      records: [{ model: "qwen-test", tokenLimit: 1000, appliedAt: "2026-01-02 03:04" }],
      total: 9,
    },
    text: "qwen-test",
  },
  {
    name: "quota list",
    command: quotaList,
    flags: { name: "qwen", page: 2, pageSize: 3 },
    response: { output: { quotas: [limits], total: 9 } },
    want: { items: [limits], total: 9 },
    text: "qwen-test",
  },
  {
    name: "quota update",
    command: quotaUpdate,
    flags: { model: "qwen-test", rpm: 60, tpm: 1000 },
    response: { request_id: "request-test" },
    want: { model: "qwen-test", request_id: "request-test" },
    text: 'Rate limits updated for "qwen-test": QPM 60, TPM 1,000\n',
  },
  {
    name: "security overview",
    command: securityOverview,
    flags: {},
    response: overview,
    want: overview,
    text: "Scanned: 10    Risks: 1",
  },
  {
    name: "security alerts",
    command: securityAlerts,
    flags: { page: 2, pageSize: 3, statusList: ["unhandled", "handling"], riskLevel: "high" },
    response: alerts,
    want: alerts,
    text: "Next page cursor: next-cursor",
  },
];
let directory: string;
let server: Server;
let origin: string;
let responseBody: unknown;
let status: number;
let requests: Array<{ method: string; path: string; body?: unknown }>;
let consoleCalls: Array<{ api: string; data: Record<string, unknown> }>;
let consoleEmpty: boolean;
let consoleFailure: boolean;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "bl-resource-output-"));
  status = 200;
  requests = [];
  consoleCalls = [];
  consoleEmpty = false;
  consoleFailure = false;
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    requests.push({
      method: request.method!,
      path: request.url!,
      ...(body ? { body: JSON.parse(body) } : {}),
    });
    response
      .writeHead(status, { "content-type": "application/json" })
      .end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback address");
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});
async function invoke(
  scenario: Scenario,
  display: {
    format: "text" | "json";
    quiet?: boolean;
    verbose?: boolean;
    dryRun?: boolean;
    chinese?: boolean;
  },
) {
  let stdout = "";
  let stderr = "";
  let stray = "";
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stray += String(chunk);
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
    file: {},
    configPath: join(directory, "config.json"),
  });
  const localize = (text: LocalizedText) =>
    typeof text === "string" ? text : text[display.chinese ? "zh-CN" : "en-US"];
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
  const identity = { binName: "bl", npmPackage: "test", version: "test", clientName: "test" };
  const client = new Client({
    settings,
    identity,
    baseUrl: origin,
    apiCred: { token: "test-placeholder", source: "flag", baseUrl: origin },
    debug: (details) => reporter.output.debug(details),
  });
  vi.spyOn(client, "console").mockImplementation(async (api, data) => {
    consoleCalls.push({ api, data });
    if (consoleFailure) throw new BailianError("Original console failure", ExitCode.AUTH);
    if (api.includes("listModelLimitApplications"))
      return {
        records: consoleEmpty
          ? []
          : [{ deployedModel: "qwen-test", usageLimit: 1000, gmtCreate: "2026-01-02T03:04:00" }],
        items: consoleEmpty ? 0 : 9,
      };
    if (api.includes("getMonitorData"))
      return {
        data: [
          {
            aggMethod: "sum_pm",
            metricName: "model_call_count",
            points: [{ value: 12, timestamp: 1 }],
          },
          {
            aggMethod: "sum_pm",
            metricName: "model_total_amount",
            points: [{ value: 100, timestamp: 1 }],
          },
        ],
      };
    return {
      list: consoleEmpty
        ? []
        : [
            {
              model: "qwen-test",
              qpmInfo: {
                "model-default": {
                  count_limit: 60,
                  count_limit_period: 60,
                  usage_limit: 1000,
                  usage_limit_period: 60,
                },
              },
            },
          ],
      total: consoleEmpty ? 0 : 1,
    };
  });
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        flags: scenario.flags,
        settings,
        identity,
        client,
        output: reporter.output,
        localize,
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, stray, exitCode };
  } finally {
    stdoutSpy.mockRestore();
  }
}
const matrix = cases.flatMap((scenario) =>
  (["text", "json"] as const).flatMap((format) =>
    [false, true].flatMap((quiet) =>
      [false, true].map((verbose) => ({ scenario, format, quiet, verbose, name: scenario.name })),
    ),
  ),
);
test.each(matrix)(
  "$name routes full output: $format q=$quiet v=$verbose",
  async ({ scenario, ...display }) => {
    responseBody = scenario.response;
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stray).toBe("");
    if (display.format === "json") {
      expect(JSON.parse(result.stdout)).toEqual(scenario.want);
      const records = result.stderr.trim()
        ? result.stderr
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [];
      expect(records.every((record) => record.debug)).toBe(true);
    } else if (
      scenario.name.startsWith("memory") ||
      scenario.name.startsWith("profile") ||
      ["quota update", "quota delete"].includes(scenario.name)
    )
      expect(result.stdout).toBe(scenario.text);
    else expect(result.stdout).toContain(scenario.text);
    expect(result.stderr).not.toContain("test-placeholder");
    expect(requests.length + consoleCalls.length).toBeGreaterThan(0);
  },
);
test.each(cases)(
  "$name dry-run uses result channel without HTTP/console calls",
  async (scenario) => {
    responseBody = scenario.response;
    const result = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stray).toBe("");
    expect(JSON.parse(result.stdout)).toBeTypeOf("object");
    expect(requests).toEqual([]);
    expect(consoleCalls).toEqual([]);
  },
);
test.each(cases)(
  "$name failures retain one structured error and no final result",
  async (scenario) => {
    responseBody = {
      code: "ServiceLimit",
      message: "Original service failure",
      request_id: "failed-request",
    };
    status = 429;
    consoleFailure = true;
    const result = await invoke(scenario, { format: "json", quiet: true, verbose: true });
    expect(result.exitCode).toBe(scenario.command.auth === "console" ? 3 : 1);
    expect(result.stdout).toBe("");
    expect(result.stray).toBe("");
    const errors = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((record) => record.error);
    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toContain(
      scenario.command.auth === "console" ? "Original console failure" : "Original service failure",
    );
  },
);
test.each([
  "memory list",
  "memory search",
  "profile get",
  "quota list",
  "quota check",
  "quota history",
  "security alerts",
  "security overview",
])("empty $name remains structured and passes through result channel", async (name) => {
  const scenario = cases.find((candidate) => candidate.name === name)!;
  responseBody =
    name === "quota list"
      ? { output: { quotas: [], total: 0 } }
      : name.startsWith("security")
        ? { success: true, data: null }
        : {};
  consoleEmpty = true;
  const result = await invoke(scenario, { format: "json", quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stray).toBe("");
  const data = JSON.parse(result.stdout);
  if (name === "quota check") expect(data).toEqual([]);
  if (name === "security alerts") expect(data).toEqual({ stats: null, data: [], next_page: null });
  if (name === "security overview") expect(data).toEqual({});
});
test("memory and quota requests retain their parameters", async () => {
  const add = cases[0]!;
  responseBody = add.response;
  expect((await invoke(add, { format: "json", quiet: true })).exitCode).toBe(0);
  expect(requests[0]!.body).toEqual({
    user_id: "user-test",
    custom_content: "Hello",
    profile_schema: "schema-test",
    memory_library_id: "lib-test",
  });
  const search = cases[3]!;
  responseBody = search.response;
  await invoke(search, { format: "json", quiet: true });
  expect(requests[1]!.body).toEqual({
    user_id: "user-test",
    query: "Hello",
    messages: [{ role: "user", content: "Hello" }],
    top_k: 3,
    memory_library_id: "lib-test",
  });
  const update = cases.find((scenario) => scenario.name === "quota update")!;
  responseBody = update.response;
  await invoke(update, { format: "json", quiet: true });
  expect(requests[2]!.body).toEqual({
    models: [
      {
        model: "qwen-test",
        request_limit: 60,
        request_limit_period: 60,
        usage_limit: 1000,
        usage_limit_period: 60,
      },
    ],
  });
});
test("security query preserves pagination and repeated statuses", async () => {
  const scenario = cases.find((candidate) => candidate.name === "security alerts")!;
  responseBody = scenario.response;
  await invoke(scenario, { format: "json", quiet: true });
  const query = new URL(requests[0]!.path, origin).searchParams;
  expect(query.getAll("status_list")).toEqual(["unhandled", "handling"]);
  expect(query.get("current_page")).toBe("2");
  expect(query.get("page_size")).toBe("3");
});

const cliCases = [
  {
    name: "memory list",
    route: "memory list",
    exportName: "memoryList",
    args: ["--user-id", "user-test"],
  },
  {
    name: "memory add",
    route: "memory add",
    exportName: "memoryAdd",
    args: ["--user-id", "user-test", "--content", "Hello"],
  },
  { name: "quota list", route: "quota list", exportName: "quotaList", args: [] },
  {
    name: "quota update",
    route: "quota update",
    exportName: "quotaUpdate",
    args: ["--model", "qwen-test", "--rpm", "60"],
  },
  {
    name: "security alerts",
    route: "agents security alerts",
    exportName: "securityAlerts",
    args: [],
  },
  {
    name: "quota delete",
    route: "quota delete",
    exportName: "quotaDelete",
    args: ["--model", "qwen-test", "--yes"],
  },
  {
    name: "confirmation",
    route: "quota delete",
    exportName: "quotaDelete",
    args: ["--model", "qwen-test"],
  },
];
test.each(cliCases)("real CLI keeps JSON/env quiet/confirmation for $name", async (item) => {
  const scenario = cases.find(
    (candidate) => candidate.name === (item.name === "confirmation" ? "quota delete" : item.name),
  )!;
  responseBody = scenario.response;
  writeFileSync(join(directory, "config.json"), JSON.stringify({ language: "en-US" }));
  const child = spawn(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("../e2e/harness/main.ts", import.meta.url)),
      ...item.route.split(" "),
      ...item.args,
      "--output",
      "json",
      "--verbose",
    ],
    {
      env: {
        ...process.env,
        HOME: directory,
        BAILIAN_CONFIG_DIR: directory,
        BAILIAN_E2E_ROUTES: JSON.stringify([{ path: item.route, export: item.exportName }]),
        DASHSCOPE_API_KEY: "test-placeholder",
        DASHSCOPE_BASE_URL: origin,
        DASHSCOPE_QUIET: "1",
        DASHSCOPE_VERBOSE: "0",
        DO_NOT_TRACK: "1",
        BAILIAN_INSTALL_METHOD: "brew",
        NODE_NO_WARNINGS: "1",
        NODE_USE_ENV_PROXY: "0",
        HTTP_PROXY: "",
        http_proxy: "",
        HTTPS_PROXY: "",
        https_proxy: "",
        ALL_PROXY: "",
        all_proxy: "",
        NO_PROXY: "",
        no_proxy: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const records = stderr.trim()
    ? stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
  if (item.name === "confirmation") {
    expect(exitCode, stderr).toBe(7);
    expect(stdout).toBe("");
    expect(requests).toEqual([]);
    expect(records.filter((record) => record.error)).toHaveLength(1);
  } else {
    expect(exitCode, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual(scenario.want);
    expect(records.every((record) => record.debug)).toBe(true);
    expect(requests).toHaveLength(1);
  }
});
