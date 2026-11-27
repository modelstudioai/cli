import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { httpTransport } from "bailian-cli-core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import { runCommandHelp, runCommandInProcess } from "./helpers.ts";
import { MCP_ROUTES, SKILL_ROUTES } from "./topic-routes.ts";

const collection = "/api/v1/mcp/servers";
const code = "mcp-example";
const item = `${collection}/${code}`;
const remoteConfig = {
  url: "https://mcp.example.com",
  headers: { "X-My-Token": "private-fixture" },
};
const configArgs = ["--mcp-type", "http", "--mcp-config", JSON.stringify(remoteConfig)];
const createArgs = [
  "create",
  "--name",
  "weather",
  "--description",
  "Weather lookup",
  ...configArgs,
];
const target = ["--server", code];
const initialize = {
  status: 200,
  body: {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "fixture", version: "1" },
  },
};
let requests: { method?: string; path?: string; auth?: string; body: string }[];
let replies: ({ status: number; body: unknown } | "disconnect")[];
const gateway = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  requests.push({
    method: request.method,
    path: request.url,
    auth: request.headers.authorization,
    body: Buffer.concat(chunks).toString(),
  });
  if (request.url === "/protocol") {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const page = replies.shift();
    if (page === undefined || page === "disconnect") {
      response.writeHead(500).end();
      return;
    }
    response.writeHead(page.status, { "Content-Type": "application/json" });
    if (page.status >= 400) {
      response.end(JSON.stringify(page.body));
      return;
    }
    const payload =
      page.body && typeof page.body === "object" && "error" in page.body
        ? page.body
        : { result: page.body };
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...payload }));
    return;
  }
  const reply = replies.shift() ?? { status: 500, body: { message: "Unexpected request" } };
  if (reply === "disconnect") {
    response.destroy();
    return;
  }
  response.writeHead(reply.status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(reply.body));
});
let origin: string;
let directory: string;
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    gateway.once("error", reject);
    gateway.listen(0, "127.0.0.1", resolve);
  });
  const address = gateway.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  gateway.closeAllConnections();
  await new Promise<void>((resolve) => gateway.close(() => resolve()));
});
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "bl-mcp-management-"));
  requests = [];
  replies = [];
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(args: string[], overrides: NodeJS.ProcessEnv = {}) {
  return runCommandInProcess(
    MCP_ROUTES,
    ["mcp", ...args, "--output", "json"],
    {
      DASHSCOPE_API_KEY: "offline-key",
      DASHSCOPE_BASE_URL: origin,
      BAILIAN_WORKSPACE_ID: "",
      NODE_OPTIONS: "",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      NO_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      all_proxy: "",
      no_proxy: "",
      NODE_USE_ENV_PROXY: "",
      ...overrides,
    },
    { cwd: directory },
  );
}
function reply(data: unknown, status = 200) {
  replies.push({ status, body: { success: true, data, request_id: "req-write" } });
}
function detail(status = "INACTIVE", type = "CUSTOMER") {
  reply({
    mcp_code: code,
    type,
    server_name: "original",
    server_status: status,
    mcp_config: remoteConfig,
  });
}
function expectRequests(...expected: [string, string, unknown?][]) {
  expect(requests).toEqual(
    expected.map(([method, path, body]) => ({
      method,
      path,
      auth: "Bearer offline-key",
      body: body === undefined ? "" : expect.any(String),
    })),
  );
  expected.forEach(([, , body], index) => {
    if (body !== undefined) expect(JSON.parse(requests[index]!.body)).toEqual(body);
  });
}

test("MCP OpenAPI selects the production workspace origin and honors explicit base URLs", async ({
  onTestFinished,
}) => {
  const urls: string[] = [];
  const fetch = vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    urls.push(request.url);
    expect(request.headers.get("Authorization")).toBe("Bearer offline-key");
    return Response.json({ success: true, data: [] });
  });
  onTestFinished(() => fetch.mockRestore());
  writeFileSync(join(directory, "config.json"), JSON.stringify({ workspace_id: "ws-config" }));
  const env = { BAILIAN_CONFIG_DIR: directory, DASHSCOPE_BASE_URL: "" };
  const args = ["tool", "list", ...target];
  for (const [extra, overrides] of [
    [[], {}],
    [[], { BAILIAN_WORKSPACE_ID: "ws-env" }],
    [["--workspace-id", "ws-flag"], { BAILIAN_WORKSPACE_ID: "ws-env" }],
    [["--base-url", origin], {}],
  ] as const) {
    const result = await run([...args, ...extra], { ...env, ...overrides });
    expect(result.exitCode, result.stderr).toBe(0);
  }
  expect(urls).toEqual(
    [
      "https://ws-config.cn-beijing.maas.aliyuncs.com",
      "https://ws-env.cn-beijing.maas.aliyuncs.com",
      "https://ws-flag.cn-beijing.maas.aliyuncs.com",
      origin,
    ].map((base) => base + item + "/tools"),
  );
  writeFileSync(join(directory, "config.json"), "{}");
  const missing = await run(args, env);
  expect(missing.exitCode, missing.stderr).toBe(2);
  expect(missing.stderr).toContain("--workspace-id");
  const invalid = await run([...args, "--workspace-id", "other.example/path"], env);
  expect(invalid.exitCode, invalid.stderr).toBe(2);
  const preview = await run([...args, "--dry-run"], env);
  expect(preview.exitCode, preview.stderr).toBe(0);
  expect(urls).toHaveLength(4);
});

describe("MCP tool discovery", () => {
  const properties = { orderId: { type: "object", additionalProperties: false } };
  const schema = { type: "object", properties, required: ["orderId"], additionalProperties: false };
  const publicSchema = {
    type: "object",
    properties,
    required: ["orderId"],
    additional_properties: false,
  };
  const recommendation = `${collection}/tools/recommend`;

  test("tool search previews locally and requests recommendations directly", async () => {
    const args = ["tool", "search", "--query", " 查订单 "];
    const preview = await run([...args, "--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      plan: { query: "查订单", limit: 10 },
      risk: null,
    });
    expectRequests();
    reply([]);
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
    expectRequests(["GET", `${recommendation}?query=${encodeURIComponent("查订单")}&topN=10`]);
  });

  test("tool search encodes the query, limits results in order and keeps schema property names", async () => {
    reply([
      { serverCode: "one", toolName: "lookup", toolInputSchema: schema, score: 10 },
      {
        server_code: "two",
        tool_name: "other",
        tool_description: "Order status",
        tool_input_schema: null,
      },
      { server_code: "three", tool_name: "discarded" },
    ]);
    const result = await run(["tool", "search", "--query", " 订单 &+% ", "--limit", "2"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        server_code: "one",
        tool_name: "lookup",
        tool_description: null,
        tool_input_schema: publicSchema,
      },
      {
        server_code: "two",
        tool_name: "other",
        tool_description: "Order status",
        tool_input_schema: null,
      },
    ]);
    expectRequests(["GET", `${recommendation}?query=%E8%AE%A2%E5%8D%95+%26%2B%25&topN=2`]);
  });

  test("tool search exposes the recommended mcp_code as server_code", async () => {
    reply([
      {
        mcp_code: "weather",
        tool_name: "forecast",
        tool_description: "Forecast",
        tool_input_schema: schema,
      },
      { mcpCode: "orders", toolName: "lookup" },
    ]);
    const result = await run(["tool", "search", "--query", "lookup"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        server_code: "weather",
        tool_name: "forecast",
        tool_description: "Forecast",
        tool_input_schema: publicSchema,
      },
      {
        server_code: "orders",
        tool_name: "lookup",
        tool_description: null,
        tool_input_schema: null,
      },
    ]);
    expectRequests(["GET", `${recommendation}?query=lookup&topN=10`]);
  });

  test.each([
    ["tool", "search", "--query", "  "],
    ...["0", "-1", "1.5", "2147483648"].map((limit) => [
      "tool",
      "search",
      "--query",
      "order",
      "--limit",
      limit,
    ]),
    ["tool", "list", "--server", ".."],
    ["tools", "--server", " "],
    ["tools", ...target, "--url", "missing-scheme"],
  ])("invalid discovery flags %s %s %s %s fail locally", async (...args) => {
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(2);
    expectRequests();
  });

  test("tool list directly retrieves the public tool definitions", async () => {
    const server = "name/with space";
    const path = `${collection}/name%2Fwith%20space`;
    reply([
      { name: "lookup", description: "Find order", input_schema: publicSchema, internal: true },
    ]);
    const result = await run(["tool", "list", "--server", server]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { name: "lookup", description: "Find order", input_schema: publicSchema },
    ]);
    expectRequests(["GET", `${path}/tools`]);
  });

  test("tool list previews offline and preserves upstream failures", async () => {
    const args = ["tool", "list", ...target];
    const preview = await run([...args, "--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      plan: { server: code },
      risk: null,
    });
    expectRequests();
    replies.push({
      status: 200,
      body: {
        success: false,
        error_code: "NotAvailable",
        error_msg: "原始服务错误",
        request_id: "req-tools",
      },
    });
    const failed = await run(args);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe("");
    expect(JSON.parse(failed.stderr).error).toMatchObject({
      api_code: "NotAvailable",
      message: "原始服务错误",
      request_id: "req-tools",
    });
    expectRequests(["GET", `${item}/tools`]);
  });

  test.each([
    { args: ["tool", "list", ...target], data: { items: [] } },
    {
      args: ["tool", "search", "--query", "order"],
      data: [{ tool_name: "missing_server_code" }],
    },
  ])("rejects malformed discovery data for $args", async ({ args, data }) => {
    reply(data);
    const result = await run(args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.request_id).toBe("req-write");
  });

  test.each(["initialize", "tools/list"])(
    "native tools preserves HTTP failures during %s",
    async (stage) => {
      if (stage === "tools/list") replies.push(initialize);
      replies.push({
        status: stage === "initialize" ? 401 : 404,
        body: {
          message: "original upstream failure",
          code: "ServerReportedCode",
          request_id: "req-protocol",
        },
      });
      const result = await run(["tools", ...target, "--url", `${origin}/protocol`]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error).toMatchObject({
        message: expect.stringContaining("original upstream failure"),
        api_code: "ServerReportedCode",
        http_status: stage === "initialize" ? 401 : 404,
        request_id: "req-protocol",
      });
      if (stage === "initialize")
        expect(requests.map((request) => request.method)).toEqual(["POST"]);
    },
  );

  test("native tools keeps an explicit upstream auth code and the JSON-RPC message", async () => {
    replies.push(initialize, {
      status: 200,
      body: {
        error: {
          code: -32003,
          message: "Upstream credentials expired",
          data: { error_code: "UPSTREAM_AUTH_FAILED", request_id: "req-rpc" },
        },
      },
    });
    const result = await run(["tools", ...target, "--url", `${origin}/protocol`]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      message: "MCP error (-32003): Upstream credentials expired",
      api_code: "UPSTREAM_AUTH_FAILED",
      request_id: "req-rpc",
    });
  });

  test.each([false, true])("native tools follows opaque cursors (repeated=%s)", async (repeat) => {
    const first = { name: "one", inputSchema: { type: "object" }, _meta: { source: "native" } };
    const second = { name: "two", inputSchema: { type: "object" } };
    const cursor = "page /+";
    const url = `${origin}/protocol`;
    replies.push(
      initialize,
      { status: 200, body: { tools: [first], nextCursor: cursor } },
      { status: 200, body: { tools: [second], ...(repeat ? { nextCursor: cursor } : {}) } },
    );
    const result = await run(["tools", ...target, "--url", url]);
    const messages = requests
      .filter((request) => request.method === "POST")
      .map((request) => JSON.parse(request.body));
    expect(messages.map((message) => message.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/list",
    ]);
    expect(messages.at(-1).params.cursor).toBe(cursor);
    if (repeat) {
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
    } else {
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ server: code, url, tools: [first, second] });
    }
  });
});

describe("MCP tool invocation", () => {
  const args = ["tool", "call", ...target, "--tool", "get.order"];
  const path = `${item}/tools/call`;

  test("OpenAPI previews merged arguments locally and sends the tool request directly", async () => {
    const preview = await run([...args, "--query", "业务查询", "--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      plan: {
        action: "call_tool",
        server: code,
        tool: "get.order",
        tool_params: { query: "业务查询" },
      },
      risk: null,
    });
    expectRequests();
    reply({ is_error: false, content: [] });
    const called = await run([...args, "--arg", "value=fixture-sensitive"]);
    expect(called.exitCode, called.stderr).toBe(0);
    expect(called.stdout + called.stderr).not.toContain("fixture-sensitive");
    expectRequests([
      "POST",
      path,
      { tool_name: "get.order", tool_params: { value: "fixture-sensitive" } },
    ]);
  });

  test("OpenAPI encodes the server in the path and sends the literal tool name and merged parameters in the body", async () => {
    const server = "srv /one";
    const tool = "查/订单?#";
    const options = [
      "--json",
      '{"orderId":"old","nested":{"keepCase":null},"query":1,"__proto__":"base"}',
      "--arg",
      "orderId=new=value",
      "--arg",
      "number=0",
      "--arg",
      "items=[true,null]",
      "--arg",
      "query=false",
      "--arg",
      "__proto__=literal",
      "--arg",
      "empty=",
      "--query",
      "42",
    ];
    const content = [{ type: "text", text: '{"OrderId":3}' }, { type: "image" }];
    reply({ isError: false, content });
    const called = await run(["tool", "call", "--server", server, "--tool", tool, ...options]);
    expect(called.exitCode, called.stderr).toBe(0);
    expect(JSON.parse(called.stdout)).toEqual({ is_error: false, content });
    expectRequests([
      "POST",
      `${collection}/srv%20%2Fone/tools/call`,
      {
        tool_name: tool,
        tool_params: {
          orderId: "new=value",
          nested: { keepCase: null },
          query: "42",
          ["__proto__"]: "literal",
          number: 0,
          items: [true, null],
          empty: "",
        },
      },
    ]);
    expect(Object.hasOwn(JSON.parse(requests[0]!.body).tool_params, "__proto__")).toBe(true);
  });

  test("a parameterless tool with a dot-segment name is sent in the body and retains nullable results", async () => {
    reply({ is_error: null, content: null });
    const called = await run(["tool", "call", ...target, "--tool", ".."]);
    expect(called.exitCode, called.stderr).toBe(0);
    expect(JSON.parse(called.stdout)).toEqual({ is_error: null, content: null });
    expectRequests(["POST", path, { tool_name: "..", tool_params: {} }]);
  });

  test.each(["is_error", "isError"])(
    "OpenAPI reports tool failure with %s even on HTTP 200",
    async (key) => {
      const content = [
        { type: null, text: "原始服务错误" },
        { type: "image" },
        { type: "text", text: "more detail" },
      ];
      reply({ [key]: true, content });
      const called = await run(args);
      expect(called.exitCode).toBe(1);
      expect(JSON.parse(called.stdout)).toEqual({ is_error: true, content });
      expect(JSON.parse(called.stderr).error).toMatchObject({
        message: "原始服务错误\nmore detail",
        request_id: "req-write",
      });
      expectRequests(["POST", path, { tool_name: "get.order", tool_params: {} }]);
    },
  );

  test.each([400, 200])("OpenAPI preserves envelope failures on HTTP %i", async (status) => {
    replies.push({
      status,
      body: {
        success: false,
        data: null,
        error_code: "CallFailed",
        error_msg: "Call failed upstream",
        request_id: "request-call",
      },
    });
    const called = await run(args);
    expect(called.exitCode).toBe(1);
    expect(called.stdout).toBe("");
    expect(JSON.parse(called.stderr).error).toMatchObject({
      api_code: "CallFailed",
      message: "Call failed upstream",
      request_id: "request-call",
    });
    expectRequests(["POST", path, { tool_name: "get.order", tool_params: {} }]);
  });

  test.each([{ is_error: "false" }, { content: [42] }, { unrelated: true }])(
    "rejects malformed tool result %j",
    async (data) => {
      reply(data);
      const called = await run(args);
      expect(called.exitCode).toBe(1);
      expect(called.stdout).toBe("");
      expect(JSON.parse(called.stderr).error.request_id).toBe("req-write");
    },
  );

  test.each([
    ["tool", "call", "--server", "..", "--tool", "get.order"],
    ["tool", "call", ...target, "--tool", " "],
    [...args, "--json", "null"],
    [...args, "--arg", " =123"],
    ["call", "--target", " .name"],
    ["call", "--target", "srv.tool", "--url", "no-scheme"],
    ["call", "--target", "srv.tool", "--json", ""],
  ])("invalid call flags %j fail before any request", async (...argv) => {
    const invalid = await run(argv);
    expect(invalid.exitCode, invalid.stderr).toBe(2);
    expectRequests();
  });

  test.each([false, true])(
    "native call sends tools/call once and preserves the result contract (error=%s)",
    async (isError) => {
      const result = {
        isError,
        content: [{ type: "text", text: "native tool message" }],
        structuredContent: { orderId: "A1" },
      };
      replies.push(initialize, { status: 200, body: result });
      const called = await run([
        "call",
        "--target",
        "srv.get.order",
        "--url",
        `${origin}/protocol`,
        "--json",
        '{"orderId":1}',
        "--arg",
        "orderId=2",
        "--query",
        "false",
      ]);
      const messages = requests
        .filter((request) => request.method === "POST")
        .map((request) => JSON.parse(request.body));
      expect(messages.map((message) => message.method)).toEqual([
        "initialize",
        "notifications/initialized",
        "tools/call",
      ]);
      expect(messages.at(-1).params).toEqual({
        name: "get.order",
        arguments: { orderId: 2, query: "false" },
      });
      if (isError) {
        expect(called.exitCode).toBe(1);
        expect(called.stdout).toBe("");
        expect(JSON.parse(called.stderr).error.message).toBe("native tool message");
      } else {
        expect(called.exitCode, called.stderr).toBe(0);
        expect(JSON.parse(called.stdout)).toEqual(result);
      }
    },
  );
});

describe("MCP detail and activated inventory", () => {
  test("get combines both responses and preserves downstream schema keys", async () => {
    reply({
      mcpCode: code,
      serverName: "weather",
      type: "OFFICIAL",
      serverStatus: "ACTIVATED",
      serverType: "HTTP",
      description: "Weather",
      dashscopeEndpoint: "https://example.com/mcp",
      metaInfo: {
        provider: "fixture",
        billing: {
          mode: "per_call",
          unitPrice: "0.010",
          currency: "CNY",
          freeQuota: 0,
          privateKey: "private-fixture",
        },
        isOnekey: false,
        consoleDetailURL: "https://example.com/detail",
      },
      mcpConfig: remoteConfig,
    });
    const properties = { myCity: { type: "object", additionalProperties: false } };
    reply([
      {
        name: "lookup",
        description: "Weather",
        inputSchema: { properties, required: ["myCity"], additionalProperties: false },
      },
    ]);
    const result = await run(["get", ...target]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      server_code: code,
      server_name: "weather",
      activated: true,
      provider: "fixture",
      billing: {
        mode: "per_call",
        unit_price: "0.010",
        currency: "CNY",
        free_quota: 0,
        unit: null,
      },
      console_url: "https://example.com/detail",
      endpoint: "https://example.com/mcp",
      tools: [
        {
          name: "lookup",
          input_schema: { properties, required: ["myCity"], additional_properties: false },
        },
      ],
    });
    expect(result.stdout + result.stderr).not.toContain("private-fixture");
    expectRequests(["GET", item], ["GET", `${item}/tools`]);
  });

  test.each([true, undefined])(
    "get previews details and retrieves tools directly for OneKey or unknown policy (%s)",
    async (onekey) => {
      const server = {
        mcp_code: code,
        type: "OFFICIAL",
        server_status: "INACTIVE",
        meta_info: { is_onekey: onekey },
      };
      reply(server);
      const preview = await run(["get", ...target, "--dry-run"]);
      expect(preview.exitCode, preview.stderr).toBe(0);
      expect(JSON.parse(preview.stdout)).toMatchObject({
        plan: { activated: false, billing: null, server_code: code },
        risk: null,
      });
      expectRequests(["GET", item]);
      reply(server);
      reply([{ name: "ready", input_schema: null, description: null }]);
      const result = await run(["get", ...target]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).tools[0].name).toBe("ready");
      expectRequests(["GET", item], ["GET", item], ["GET", `${item}/tools`]);
    },
  );

  test("get retains details and the original service error when only tool discovery fails", async () => {
    detail();
    replies.push({
      status: 400,
      body: {
        success: false,
        error_code: "11200026",
        error_msg: "未开通该MCP或非可用开通状态",
        request_id: "tool-request",
      },
    });
    const result = await run(["get", ...target]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      server_code: code,
      activated: false,
      tools: null,
    });
    expect(JSON.parse(result.stderr).error).toMatchObject({
      api_code: "11200026",
      message: "未开通该MCP或非可用开通状态",
      request_id: "tool-request",
    });
    expectRequests(["GET", item], ["GET", `${item}/tools`]);
  });

  test("a missing server stops before fetching tools", async () => {
    replies.push({
      status: 404,
      body: {
        success: false,
        error_code: "McpServerNotFound",
        error_msg: "服务不存在",
        request_id: "lookup",
      },
    });
    const result = await run(["get", ...target]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.request_id).toBe("lookup");
    expectRequests(["GET", item]);
  });

  test("list filters all candidate pages before selecting a page or counting matches", async () => {
    const candidates = Array.from({ length: 102 }, (_unused, index) => ({
      mcp_code: `fixture-${index}`,
      type: "CUSTOMER",
      server_name: index === 2 ? "Other" : "MyWeather",
      server_status: [0, 2, 100, 101].includes(index) ? "ACTIVATED" : "ACTIVATING",
      dashscope_endpoint: "https://example.com/mcp",
      mcp_config: remoteConfig,
    }));
    reply({ items: candidates.slice(0, 100), total: 102, pageNo: 1, pageSize: 100 });
    reply({ items: candidates.slice(100), total: 102, page_no: 2, page_size: 100 });
    const result = await run([
      "list",
      "--type",
      "PRIVATE",
      "--name",
      "WEATH",
      "--page",
      "2",
      "--page-size",
      "1",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.total).toBe(3);
    expect(parsed.servers).toHaveLength(1);
    expect(parsed.servers[0]).toMatchObject({
      code: "fixture-100",
      name: "MyWeather",
      streamable: true,
      connected_agents: [],
      config_paths: {},
    });
    expect(result.stdout).not.toContain("private-fixture");
    expectRequests(
      ["GET", `${collection}/list?type=CUSTOMER&pageNo=1&pageSize=100`],
      ["GET", `${collection}/list?type=CUSTOMER&pageNo=2&pageSize=100`],
    );
  });

  test("list reports only registrations matching the actual native configuration", async () => {
    const env = { BAILIAN_CONFIG_DIR: directory, CODEX_HOME: join(directory, "codex") };
    reply({
      mcp_code: code,
      type: "OFFICIAL",
      server_status: "ACTIVATED",
      dashscope_endpoint: "https://workspace.example/mcp",
    });
    const connected = await run(
      ["connect", ...target, "--agent", "codex", "--transport", "streamable-http"],
      env,
    );
    expect(connected.exitCode, connected.stderr).toBe(0);
    const path = join(env.CODEX_HOME, "config.toml");
    const inventory = {
      total: 1,
      items: [
        { mcp_code: code, server_name: "weather", type: "OFFICIAL", server_status: "ACTIVATED" },
      ],
    };
    reply(inventory);
    const listed = await run(["list"], env);
    expect(listed.exitCode, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout).servers[0]).toMatchObject({
      connected_agents: ["codex"],
      config_paths: { codex: [path] },
    });
    expect(listed.stdout).not.toContain("offline-key");
    const changed = readFileSync(path, "utf8").replace("offline-key", "local-change");
    writeFileSync(path, changed);
    reply(inventory);
    const stale = await run(["list"], env);
    expect(stale.exitCode, stale.stderr).toBe(0);
    expect(JSON.parse(stale.stdout).servers[0].connected_agents).toEqual([]);
    expect(readFileSync(path, "utf8")).toBe(changed);
    const pagePath = `${collection}/list?type=OFFICIAL&pageNo=1&pageSize=100`;
    expectRequests(["GET", item], ["GET", pagePath], ["GET", pagePath]);
  });

  test("list never returns an unverified total outside the scan window", async () => {
    reply({ items: [], total: 10_001, page_no: 1, page_size: 100 });
    const result = await run(["list"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("10000");
    expectRequests(["GET", `${collection}/list?type=OFFICIAL&pageNo=1&pageSize=100`]);
  });

  test("invalid get and list flags fail before requests and list preview stays offline", async () => {
    for (const args of [
      ["get"],
      ["get", "--server", " "],
      ["list", "--page", "0"],
      ["list", "--page-size", "1.5"],
      ["list", "--page-size", "101"],
      ["list", "--page", "101", "--page-size", "100"],
      ["list", "--type", "all"],
    ]) {
      expect((await run([...args, "--dry-run"])).exitCode, args.join(" ")).toBe(2);
    }
    const preview = await run(["list", "--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({ type: "OFFICIAL", page: 1, page_size: 30 });
    expectRequests();
  });
});

describe("native Agent registration", () => {
  const endpoint = "https://workspace.example/api/v1/mcps/mcp-example/mcp";
  const connect = ["connect", ...target, "--transport", "streamable-http"];
  const project = ["--agent", "cursor", "--scope", "project"];
  function env() {
    return {
      HOME: join(directory, "user"),
      CODEX_HOME: join(directory, "user", ".codex"),
      BAILIAN_CONFIG_DIR: join(directory, "state"),
      DSH_HOME: join(directory, "user", ".dsh"),
      ZCODE_HOME: join(directory, "user", ".zcode"),
      OPENCLAW_CONFIG_PATH: "",
      PI_CODING_AGENT_DIR: join(directory, "user", ".pi", "agent"),
    };
  }
  function ready(url = endpoint) {
    reply({ mcpCode: code, type: "OFFICIAL", serverStatus: "ACTIVATED", dashscopeEndpoint: url });
  }

  test("user and project records coexist, project disconnect works offline and respects a manual edit", async () => {
    const local = env();
    for (const scope of ["user", "project"]) {
      ready();
      const result = await run([...connect, "--agent", "cursor", "--scope", scope], local);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        summary: { succeeded: 1 },
        results: [{ agent: "cursor", action: "added" }],
      });
    }
    const userPath = join(local.HOME, ".cursor/mcp.json");
    const projectPath = join(directory, ".cursor/mcp.json");
    const manifestPath = join(local.BAILIAN_CONFIG_DIR, "mcp-registrations.json");
    const manifest = readFileSync(manifestPath, "utf8");
    expect(Object.values(JSON.parse(manifest).registrations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "user", projectRoot: null, configPath: userPath }),
        expect.objectContaining({
          scope: "project",
          projectRoot: realpathSync(directory),
          configPath: realpathSync(projectPath),
        }),
      ]),
    );
    expect(manifest).not.toContain("offline-key");
    const offline = { ...local, DASHSCOPE_API_KEY: "", DASHSCOPE_BASE_URL: "http://127.0.0.1:1" };
    const args = ["disconnect", ...target, ...project];
    const original = readFileSync(projectPath, "utf8");
    writeFileSync(projectPath, original.replace("offline-key", "manual-change"));
    for (const extra of [["--dry-run"], []]) {
      const result = await run([...args, ...extra], offline);
      const output = JSON.parse(result.stdout);
      expect((output.targets ?? output.results)[0]).toMatchObject({
        status: "failed",
        error_code: "MODIFIED_CONFLICT",
      });
      expect(result.exitCode).toBe(extra.length ? 0 : 1);
      expect(readFileSync(manifestPath, "utf8")).toBe(manifest);
      expect(readFileSync(projectPath, "utf8")).toContain("manual-change");
    }
    writeFileSync(projectPath, original);
    expect((await run(args, offline)).exitCode).toBe(0);
    const again = await run(args, offline);
    expect(JSON.parse(again.stdout).results[0]).toMatchObject({
      status: "noop",
      reason: "NOT_CONNECTED",
    });
    expect(readFileSync(userPath, "utf8")).toContain(endpoint);
    expect(JSON.parse(readFileSync(projectPath, "utf8")).mcpServers).toEqual({});
    expectRequests(["GET", item], ["GET", item]);
  });

  test("connect previews activation and registers the endpoint returned after enable", async () => {
    const local = env();
    const file = join(directory, ".cursor/mcp.json");
    for (const extra of [["--dry-run"], ["--and-activate=false"]]) {
      detail("INACTIVE", "CUSTOMER");
      const result = await run([...connect, ...project, ...extra], local);
      if (extra[0] === "--dry-run") {
        expect(result.exitCode, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          plan: { activation: "enable", endpoint: null },
          risk: null,
        });
      } else {
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stdout).results[0].error_code).toBe("NOT_ACTIVATED");
      }
      expect(existsSync(file)).toBe(false);
      expect(existsSync(join(local.BAILIAN_CONFIG_DIR, "mcp-registrations.json"))).toBe(false);
    }
    detail("INACTIVE", "CUSTOMER");
    reply({ mcp_code: code, server_status: "ACTIVATED" });
    ready();
    const applied = await run([...connect, ...project], local);
    expect(applied.exitCode, applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      results: [{ status: "succeeded" }],
      next_step: expect.stringContaining("mcp tools --server"),
    });
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers[code].url).toBe(endpoint);
    expectRequests(
      ["GET", item],
      ["GET", item],
      ["GET", item],
      ["POST", item + "/enable"],
      ["GET", item],
    );
  });

  test("pending deployments, incomplete endpoints and manual activation do not create a local connection", async () => {
    const local = env();
    const args = [...connect, ...project];
    detail("INACTIVE", "OFFICIAL");
    reply({ mcp_code: code, server_status: "ACTIVATING" });
    const pending = await run(args, local);
    expect(JSON.parse(pending.stdout)).toMatchObject({
      server_status: "ACTIVATING",
      results: [{ error_code: "SERVER_NOT_READY" }],
    });
    for (const [url, errorCode] of [
      ["", "ENDPOINT_UNAVAILABLE"],
      [endpoint.replace("/mcp-example/mcp", "/mcp-example/sse"), "TRANSPORT_MISMATCH"],
    ]) {
      ready(url);
      const result = await run(args, local);
      expect(JSON.parse(result.stdout).results[0].error_code).toBe(errorCode);
    }
    detail("INACTIVE", "OFFICIAL");
    replies.push({
      status: 400,
      body: {
        error_code: "OperationNotSupported",
        error_msg: "当前MCP需要选择凭据，不支持通过OpenAPI开通，请登录百炼控制台手动开通",
        request_id: "manual-id",
      },
    });
    const manual = await run(args, local);
    expect(manual.exitCode).toBe(1);
    expect(JSON.parse(manual.stdout).results[0]).toMatchObject({
      error_code: "MANUAL_SETUP_REQUIRED",
      api_code: "OperationNotSupported",
      request_id: "manual-id",
      detail: { console_url: expect.stringMatching(/^https:/) },
    });
    expect(existsSync(join(directory, ".cursor/mcp.json"))).toBe(false);
    expectRequests(
      ["GET", item],
      ["POST", item + "/activate"],
      ["GET", item],
      ["GET", item],
      ["GET", item],
      ["POST", item + "/activate"],
    );
  });

  test("a concurrent registration prevents activation and preserves the other owner's lock", async () => {
    const local = env();
    mkdirSync(local.BAILIAN_CONFIG_DIR);
    const lock = join(local.BAILIAN_CONFIG_DIR, "mcp-registrations.json.lock");
    writeFileSync(lock, "other owner");
    detail("INACTIVE", "OFFICIAL");
    const result = await run([...connect, ...project], local);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).summary).toEqual({ succeeded: 0, failed: 1, noop: 0 });
    expect(readFileSync(lock, "utf8")).toBe("other owner");
    expect(existsSync(join(directory, ".cursor", "mcp.json"))).toBe(false);
    expectRequests(["GET", item]);
  });

  test("all isolates each Agent's conflict, unsupported scope and successful registration", async () => {
    const local = env();
    for (const folder of [".cursor", ".qwenwork", ".claude"])
      mkdirSync(join(local.HOME, folder), { recursive: true });
    const unrelated = JSON.stringify({
      mcpServers: { [code]: { url: "https://existing.example/mcp" } },
    });
    writeFileSync(join(directory, ".mcp.json"), unrelated);
    ready();
    const result = await run([...connect, "--scope", "project", "--agent", "all"], local);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { succeeded: 1, failed: 2, noop: 0 },
      results: [
        { agent: "claude-code", error_code: "UNMANAGED_CONFLICT" },
        { agent: "cursor", action: "added" },
        { agent: "qwenwork", error_code: "SCOPE_UNSUPPORTED" },
      ],
    });
    const stopped = await run(
      ["disconnect", ...target, "--scope", "project", "--agent", "all"],
      local,
    );
    expect(JSON.parse(stopped.stdout).summary).toEqual({ succeeded: 1, noop: 1, failed: 1 });
    expect(readFileSync(join(directory, ".mcp.json"), "utf8")).toBe(unrelated);
    const conflict = await run([...connect, "--scope", "project", "--agent", "claude-code"], local);
    expect(JSON.parse(conflict.stdout).results[0].error_code).toBe("UNMANAGED_CONFLICT");
    expectRequests(["GET", item]);
  });

  test("legacy user records migrate lazily and ambiguous paths remain intact", async () => {
    const local = env();
    ready();
    const args = [...connect, "--agent", "cursor"];
    expect((await run(args, local)).exitCode).toBe(0);
    const file = join(local.BAILIAN_CONFIG_DIR, "mcp-registrations.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const record = manifest.registrations["cursor:" + code];
    for (const field of ["scope", "projectRoot", "configPath", "configPaths"]) delete record[field];
    const legacy = JSON.stringify(manifest);
    writeFileSync(file, legacy);
    ready();
    expect((await run([...args, "--dry-run"], local)).exitCode).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(legacy);
    ready();
    const noop = await run(args, local);
    expect(JSON.parse(noop.stdout).results[0]).toMatchObject({
      status: "noop",
      reason: "ALREADY_CONNECTED",
    });
    expect(JSON.parse(readFileSync(file, "utf8")).registrations["cursor:" + code]).toMatchObject({
      scope: "user",
      configPath: record.path,
    });
    record.path = join(directory, "unknown.json");
    const ambiguous = JSON.stringify(manifest);
    writeFileSync(file, ambiguous);
    const refused = await run(["disconnect", ...target, "--agent", "cursor"], local);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout).results[0].error_code).toBe("AMBIGUOUS_REGISTRATION");
    expect(readFileSync(file, "utf8")).toBe(ambiguous);
    expectRequests(["GET", item], ["GET", item], ["GET", item]);
  });
});

describe("batch MCP activation and deactivation", () => {
  function server(
    code: string,
    type: string,
    status: string,
    extras: Record<string, unknown> = {},
  ) {
    reply({ mcp_code: code, type, server_status: status, mcp_config: remoteConfig, ...extras });
  }

  test.each(["activate", "deactivate"])(
    "%s validates targets before any lookup",
    async (command) => {
      for (const value of [
        "a,,b",
        "a, ..",
        Array.from({ length: 31 }, (_, index) => `s${index}`).join(","),
      ]) {
        expect((await run([command, "--server", value])).exitCode).toBe(2);
      }
      expect((await run([command, "--dry-run"])).exitCode).toBe(2);
      expectRequests();
    },
  );

  test.each([
    ["activate", "INACTIVE", "activate", "enable"],
    ["deactivate", "ACTIVATED", "deactivate", "disable"],
  ])(
    "%s previews every distinct target without writing",
    async (command, status, officialAction, customAction) => {
      const args = [
        command,
        "--server",
        ["custom", ...Array<string>(30).fill(" official "), "custom"].join(","),
      ];
      server("custom", "CUSTOMER", status);
      server("official", "OFFICIAL", status, { meta_info: { is_onekey: true } });
      const result = await run([...args, "--dry-run"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        plan: {
          targets: [
            { code: "custom", action: customAction },
            { code: "official", action: officialAction, is_onekey: true },
          ],
        },
        risk: null,
      });
      expect(result.stdout + result.stderr).not.toContain("private-fixture");
      expectRequests(["GET", collection + "/custom"], ["GET", collection + "/official"]);
    },
  );

  test("activation reports accepted deployments, enabled custom services and idempotent skips in order", async () => {
    server("official/one", "OFFICIAL", "INACTIVE", { meta_info: { is_onekey: true } });
    server("custom", "CUSTOMER", "ACTIVATE_FAILED");
    server("ready", "OFFICIAL", "ACTIVATED");
    server("pending", "CUSTOMER", "ACTIVATING");
    reply({ mcpCode: "official/one", serverStatus: "ACTIVATING", serverStatusText: "开通中" });
    reply({ mcp_code: "custom", server_status: "ACTIVATED", mcp_config: remoteConfig });
    const result = await run(["activate", "--server", "official/one,custom,ready,pending,custom"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { succeeded: 2, failed: 0, noop: 2 },
      results: [
        {
          code: "official/one",
          status: "succeeded",
          server_status: "ACTIVATING",
          server_status_text: "开通中",
        },
        { code: "custom", status: "succeeded", server_status: "ACTIVATED" },
        { code: "ready", status: "noop", reason: "ALREADY_ACTIVATED" },
        { code: "pending", status: "noop", reason: "ALREADY_ACTIVATING" },
      ],
    });
    expect(result.stdout + result.stderr).not.toContain("private-fixture");
    expectRequests(
      ["GET", collection + "/official%2Fone"],
      ["GET", collection + "/custom"],
      ["GET", collection + "/ready"],
      ["GET", collection + "/pending"],
      ["POST", collection + "/official%2Fone/activate"],
      ["POST", collection + "/custom/enable"],
    );
  });

  test("deactivation keeps original OneKey and lookup errors and completes independent targets", async () => {
    server("onekey", "OFFICIAL", "ACTIVATED", { meta_info: { is_onekey: true } });
    replies.push({
      status: 404,
      body: { error_code: "McpServerNotFound", error_msg: "服务不存在", request_id: "missing" },
    });
    server("custom", "CUSTOMER", "ACTIVATED");
    server("official", "OFFICIAL", "ACTIVATED");
    server("stopped", "CUSTOMER", "INACTIVE");
    replies.push({
      status: 400,
      body: {
        error_code: "DeActivateFailed",
        error_msg: "OnekeyMCP不支持此操作",
        request_id: "onekey-denied",
      },
    });
    reply({ mcpCode: "custom", serverStatus: "INACTIVE" });
    reply({ mcpCode: "official", serverStatus: "INACTIVE" });
    const result = await run(["deactivate", "--server", "onekey,missing,custom,official,stopped"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { succeeded: 2, failed: 2, noop: 1 },
      results: [
        {
          code: "onekey",
          status: "failed",
          error_code: "DeActivateFailed",
          message: "OnekeyMCP不支持此操作",
          http_status: 400,
          request_id: "onekey-denied",
        },
        {
          code: "missing",
          status: "failed",
          error_code: "McpServerNotFound",
          http_status: 404,
          request_id: "missing",
        },
        { code: "custom", status: "succeeded", server_status: "INACTIVE" },
        { code: "official", status: "succeeded", server_status: "INACTIVE" },
        { code: "stopped", status: "noop", reason: "NOT_ACTIVATED" },
      ],
    });
    expect(JSON.parse(result.stderr).error.request_id).toBe("onekey-denied");
    expectRequests(
      ["GET", collection + "/onekey"],
      ["GET", collection + "/missing"],
      ["GET", collection + "/custom"],
      ["GET", collection + "/official"],
      ["GET", collection + "/stopped"],
      ["POST", collection + "/onekey/deactivate"],
      ["POST", collection + "/custom/disable"],
      ["POST", collection + "/official/deactivate"],
    );
  });

  test.each([
    ["activate", "ACTIVATED", "ALREADY_ACTIVATED"],
    ["deactivate", "INACTIVE", "NOT_ACTIVATED"],
  ])("%s skips a satisfied batch without confirmation", async (command, status, reason) => {
    detail(status);
    const result = await run([command, ...target]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { succeeded: 0, failed: 0, noop: 1 },
      results: [{ status: "noop", reason }],
    });
    expectRequests(["GET", item]);
  });

  test("manual setup from detail or an explicit activation error retains the console link and original message", async () => {
    const url = "https://bailian.console.aliyun.com/example";
    const meta_info = { console_detail_url: url };
    const message = "当前MCP需要选择Ram角色，不支持通过OpenAPI开通，请登录百炼控制台手动开通";
    server("role", "OFFICIAL", "INACTIVE", { meta_info });
    server("manual", "OFFICIAL", "INACTIVE", { meta_info, requires_manual_setup: true });
    server("busy", "OFFICIAL", "INACTIVE", { meta_info });
    replies.push({
      status: 400,
      body: { error_code: "OperationNotSupported", error_msg: message, request_id: "role-request" },
    });
    replies.push({
      status: 409,
      body: {
        error_code: "OperationNotSupported",
        error_msg: "服务部署中",
        request_id: "busy-request",
      },
    });
    const result = await run(["activate", "--server", "role,manual,busy", "--no-browser"]);
    expect(result.exitCode).toBe(1);
    const batch = JSON.parse(result.stdout);
    expect(batch).toMatchObject({
      summary: { succeeded: 0, failed: 3, noop: 0 },
      results: [
        {
          code: "role",
          status: "failed",
          error_code: "MANUAL_SETUP_REQUIRED",
          api_code: "OperationNotSupported",
          message,
          request_id: "role-request",
          detail: { console_url: url },
        },
        {
          code: "manual",
          status: "failed",
          error_code: "MANUAL_SETUP_REQUIRED",
          detail: { console_url: url },
        },
        {
          code: "busy",
          status: "failed",
          error_code: "OperationNotSupported",
          http_status: 409,
          request_id: "busy-request",
        },
      ],
    });
    expect(batch.results[0].detail).not.toHaveProperty("browser_opened");
    expect(batch.results[2]).not.toHaveProperty("detail");
    expectRequests(
      ["GET", collection + "/role"],
      ["GET", collection + "/manual"],
      ["GET", collection + "/busy"],
      ["POST", collection + "/role/activate"],
      ["POST", collection + "/busy/activate"],
    );
  });

  test("market activation uses the console link supplied with the manual setup error", async () => {
    const url = "https://modelstudio.console.alibabacloud.com/store/mcp/detail/example";
    detail("INACTIVE", "OFFICIAL");
    replies.push({
      status: 400,
      body: {
        error_code: "OperationNotSupported",
        error_msg: "当前云市场MCP不允许通过OpenAPI开通，请前往控制台手动开通：" + url,
        request_id: "market",
      },
    });
    const result = await run(["activate", ...target, "--no-browser"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).results[0]).toMatchObject({
      status: "failed",
      error_code: "MANUAL_SETUP_REQUIRED",
      request_id: "market",
      detail: { console_url: url },
    });
    expectRequests(["GET", item], ["POST", item + "/activate"]);
  });

  test("a lost response leaves the write outcome unknown and sends only one POST", async () => {
    detail("ACTIVATED", "CUSTOMER");
    replies.push("disconnect");
    const result = await run(["deactivate", ...target]);
    expect(result.exitCode, result.stderr).toBe(6);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { succeeded: 0, failed: 1, noop: 0 },
      results: [{ code, status: "failed", outcome_unknown: true, hint: expect.any(String) }],
    });
    expectRequests(["GET", item], ["POST", item + "/disable"]);
  });

  test("a successful envelope still requires the correct server and lifecycle status", async () => {
    for (const targetCode of ["failed", "missing-status", "wrong-code"])
      server(targetCode, "CUSTOMER", "INACTIVE");
    reply({
      mcp_code: "failed",
      server_status: "ACTIVATE_FAILED",
      server_status_text: "部署失败",
      activate_fail_reason: "upstream deployment error",
    });
    reply({ mcp_code: "missing-status" });
    reply({ mcp_code: "different", server_status: "ACTIVATED" });
    const result = await run(["activate", "--server", "failed,missing-status,wrong-code"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { succeeded: 0, failed: 3, noop: 0 },
      results: [
        {
          code: "failed",
          status: "failed",
          error_code: "ACTIVATE_FAILED",
          message: "upstream deployment error",
        },
        { code: "missing-status", status: "failed", request_id: "req-write" },
        { code: "wrong-code", status: "failed", request_id: "req-write" },
      ],
    });
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "GET",
      "GET",
      "POST",
      "POST",
      "POST",
    ]);
  });
});

describe("custom MCP management", () => {
  test.each([...Object.keys(MCP_ROUTES), ...Object.keys(SKILL_ROUTES)])(
    "%s exposes confirmation only for MCP deletion",
    async (path) => {
      const routes = path.startsWith("mcp ") ? MCP_ROUTES : SKILL_ROUTES;
      const help = await runCommandHelp(routes, [...path.split(" "), "--help"]);
      expect(help.exitCode, help.stderr).toBe(0);
      expect(help.stderr.includes("--yes")).toBe(path === "mcp delete");
      if (path.startsWith("mcp ") && path !== "mcp disconnect") {
        expect(help.stderr).toContain("--api-key");
        expect(help.stderr).not.toContain("--console-region");
      }
    },
  );

  test("invalid flags and JSON never reach the gateway", async () => {
    for (const flag of ["--name", "--description", "--mcp-type", "--mcp-config"]) {
      const args = [...createArgs];
      args.splice(args.indexOf(flag), 2);
      expect((await run(args)).exitCode, flag).toBe(2);
    }
    for (const args of [
      ["delete"],
      ["update", "--name", "new"],
      ["update", ...target],
      ["update", ...target, "--name", " "],
      ["update", ...target, "--mcp-type", "HTTP"],
      ["update", ...target, "--mcp-config", "{}"],
      ["update", ...target, "--mcp-type", "ftp", "--mcp-config", "{}"],
      ...[
        "{",
        "null",
        "[]",
        '{"api_host":"invalid"}',
        '{"url":"ftp://bad"}',
        '{"url":"https://example.com","headers":{"X":null}}',
      ].map((input) => ["update", ...target, "--mcp-type", "http", "--mcp-config", input]),
    ]) {
      const result = await run([...args, "--dry-run"]);
      expect(result.exitCode, args.join(" ")).toBe(2);
    }
    expectRequests();
  });

  test("a create preview sends no requests and reveals no configuration values", async () => {
    const preview = await run([...createArgs, "--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      plan: { action: "create", deploy: true, mcp_type: "HTTP" },
      risk: null,
    });
    expect(preview.stdout + preview.stderr).not.toContain("private-fixture");
    expectRequests();
  });

  test("dry-run requires API-key authentication before planning", async () => {
    const result = await run(["delete", ...target, "--dry-run"], {
      DASHSCOPE_API_KEY: "",
      BAILIAN_CONFIG_DIR: directory,
    });
    expect(result.exitCode, result.stderr).toBe(3);
    expectRequests();
  });

  test("missing and malformed config files produce distinct errors before the detail lookup", async () => {
    const args = ["update", ...target, "--mcp-type", "http", "--mcp-config", "./config.json"];
    const missing = await run(args);
    expect(missing.exitCode, missing.stderr).toBe(1);
    writeFileSync(join(directory, "config.json"), '{"token":"private-fixture",');
    const malformed = await run(args);
    expect(malformed.exitCode, malformed.stderr).toBe(2);
    expect(malformed.stderr).not.toContain("private-fixture");
    expectRequests();
  });

  test.each([
    ["hTTp", remoteConfig],
    ["sse", { url: "https://mcp.example.com/sse" }],
    [
      "stdio",
      {
        command: "npx",
        args: ["-y", "@example/weather"],
        env: { API_Key: "private-fixture" },
        fc_deploy_region: "cn-beijing",
      },
    ],
    [
      "openapi",
      {
        api_host: "https://api.example.com",
        api_list: [
          {
            name: "getOrder",
            description: "Find order",
            path: "/orders/{orderId}",
            method: "GET",
            input_params: [
              {
                name: "orderId",
                description: "Order ID",
                location: "Path",
                type: "String",
                required: true,
              },
            ],
          },
        ],
      },
    ],
  ] as const)(
    "create sends a snake_case %s body and preserves business keys",
    async (type, config) => {
      reply({ mcpCode: code, serverName: "weather", serverStatus: "ACTIVATING" }, 201);
      const result = await run([
        "create",
        "--name",
        "weather",
        "--description",
        "Weather lookup",
        "--mcp-type",
        type,
        "--mcp-config",
        JSON.stringify(config),
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        mcp_code: code,
        server_status: "ACTIVATING",
      });
      expectRequests([
        "POST",
        collection,
        {
          server_name: "weather",
          description: "Weather lookup",
          mcp_type: type.toUpperCase(),
          mcp_config: config,
        },
      ]);
    },
  );

  test("metadata-only update on a running server omits the deployment fields", async () => {
    detail("ACTIVATED");
    reply({ mcp_code: code, server_name: "new" });
    const result = await run(["update", ...target, "--name", "new"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).not.toHaveProperty("server_status");
    expectRequests(["GET", item], ["POST", item, { server_name: "new" }]);
  });

  test.each(["ACTIVATING", "ACTIVATED"])(
    "rejects configuration replacement while %s",
    async (status) => {
      detail(status);
      expect((await run(["update", ...target, ...configArgs])).exitCode).toBe(1);
      expectRequests(["GET", item]);
    },
  );

  test("update reads a relative or absolute JSON file and posts the complete replacement directly", async () => {
    const path = join(directory, "weather.json");
    writeFileSync(path, JSON.stringify(remoteConfig));
    const updateArgs = ["update", ...target, "--mcp-type", "http", "--mcp-config"];
    detail();
    const preview = await run([...updateArgs, path, "--dry-run"]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout).plan).toMatchObject({ replace_config: true, deploy: true });
    expectRequests(["GET", item]);
    expect(preview.stdout + preview.stderr).not.toContain("private-fixture");
    detail();
    reply({ mcp_code: code, server_status: "ACTIVATED" });
    const updated = await run([...updateArgs, "./weather.json"]);
    expect(updated.exitCode, updated.stderr).toBe(0);
    expectRequests(
      ["GET", item],
      ["GET", item],
      ["POST", item, { mcp_type: "HTTP", mcp_config: remoteConfig }],
    );
  });

  test.each(["update", "delete"])("%s checks ownership before writing", async (command) => {
    detail("ACTIVATED", "OFFICIAL");
    const args = command === "update" ? ["--name", "new"] : ["--yes"];
    expect((await run([command, ...target, ...args])).exitCode).toBe(1);
    expectRequests(["GET", item]);
  });

  test("delete previews local registrations, requires confirmation, and sends an empty DELETE", async () => {
    const manifestPath = join(directory, "mcp-registrations.json");
    const manifest = JSON.stringify({
      version: 1,
      registrations: { [`codex:${code}`]: { agent: "codex", serverCode: code } },
    });
    writeFileSync(manifestPath, manifest);
    const env = { BAILIAN_CONFIG_DIR: directory };
    detail();
    const preview = await run(["delete", ...target, "--dry-run"], env);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout).plan.connected_agents).toEqual(["codex"]);
    detail();
    const refused = await run(["delete", ...target], env);
    expect(refused.exitCode).toBe(7);
    expect(refused.stderr).toContain("requires_confirmation");
    detail();
    reply({ mcp_code: code, server_status: "DELETED" });
    const deleted = await run(["delete", ...target, "--yes"], env);
    expect(deleted.exitCode, deleted.stderr).toBe(0);
    expect(JSON.parse(deleted.stdout)).toMatchObject({
      server_status: "DELETED",
      connected_agents: ["codex"],
    });
    expect(readFileSync(manifestPath, "utf8")).toBe(manifest);
    expectRequests(["GET", item], ["GET", item], ["GET", item], ["DELETE", item]);
  });

  test("HTTP 201 deployment failure preserves the resource code and original cause", async () => {
    reply(
      {
        mcp_code: code,
        server_status: "ACTIVATE_FAILED",
        activate_fail_reason: "upstream handshake failed",
      },
      201,
    );
    const failed = await run(createArgs);
    expect(failed.exitCode).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      server_code: code,
      server_status: "ACTIVATE_FAILED",
    });
    expect(JSON.parse(failed.stderr).error).toMatchObject({
      message: "upstream handshake failed",
      request_id: "req-write",
    });
  });

  test("delete requires DELETED even when the service returns HTTP 200", async () => {
    detail();
    reply({ mcp_code: code, server_status: "INACTIVE" });
    const result = await run(["delete", ...target, "--yes"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).server_status).toBe("INACTIVE");
    expectRequests(["GET", item], ["DELETE", item]);
  });

  test.each([
    [
      404,
      { error_code: "McpServerUnavailable", error_msg: "当前MCP已删除", request_id: "req-error" },
    ],
    [
      200,
      { error_code: "McpServerBusy", error_msg: "MCP 当前有操作执行中", request_id: "req-error" },
    ],
    [409, { errorCode: "McpServerBusy", errorMsg: "MCP 当前有操作执行中", requestId: "req-error" }],
  ] as const)(
    "HTTP %s preserves service error details and stops before writing",
    async (status, error) => {
      replies.push({ status, body: { success: false, data: null, ...error } });
      const failed = await run(["delete", ...target, "--yes"]);
      expect(failed.exitCode).toBe(1);
      expect(JSON.parse(failed.stderr).error).toMatchObject({
        message: "error_msg" in error ? error.error_msg : error.errorMsg,
        api_code: "error_code" in error ? error.error_code : error.errorCode,
        request_id: "req-error",
        http_status: status,
      });
      expectRequests(["GET", item]);
    },
  );
});
