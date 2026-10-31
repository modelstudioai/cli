import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  WebhookEndpoint,
  WebhookEventWithDelivery,
  WebhookTestResult,
} from "@openagentpack/sdk";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e, runCommandHelp, runCommandInProcess } from "./helpers.ts";
import { MANAGED_AGENT_WEBHOOK_ROUTES as ROUTES } from "./topic-routes.ts";

const API_ROOT = "/api/v1/agentstudio";
const ENDPOINT_PATH = `${API_ROOT}/webhook_endpoints`;
const WEBHOOK_ID = "wep_a/b c";
const ENCODED_WEBHOOK_ID = encodeURIComponent(WEBHOOK_ID);
const SIGNING_SECRET = "whsec-webhook-response-test-only";
const API_KEY = "sk-webhook-cli-test-only";
const CALLBACK_URL = "https://receiver.example.test/agent-events";
const EVENT_TYPES = ["session.updated", "session.status_idled"];
const ENDPOINT = {
  id: WEBHOOK_ID,
  description: "test endpoint",
  url: CALLBACK_URL,
  events: EVENT_TYPES,
  status: "ACTIVE",
  disabled_reason: null,
  consecutive_fail: 0,
  last_success_at: null,
  last_failure_at: null,
  created_at: "2026-09-14T00:00:00Z",
  updated_at: "2026-09-14T00:00:00Z",
  request_id: "request-webhook",
} satisfies WebhookEndpoint;
const EVENT = {
  id: "whe_testevent",
  type: "event",
  created_at: "2026-09-14T00:00:00Z",
  data: { id: "whe_testevent", type: "webhook.test", workspace_id: "ws-test" },
  request_id: "request-test",
} satisfies WebhookTestResult;
const DELIVERY_EVENT = {
  type: EVENT.type,
  id: EVENT.id,
  created_at: EVENT.created_at,
  data: { ...EVENT.data, type: "session.updated", session_thread_id: "thread-test" },
  delivery: {
    webhook_id: WEBHOOK_ID,
    status: "SUCCEEDED",
    attempt_count: 1,
    delivery_at: "2026-09-14T00:00:00Z",
    finish_at: "2026-09-14T00:00:01Z",
    failure_reason: null,
  },
} satisfies WebhookEventWithDelivery;
const CREATE_ARGS = [
  "--url",
  CALLBACK_URL,
  "--event",
  EVENT_TYPES[0]!,
  "--event",
  EVENT_TYPES[1]!,
  "--description",
  "test endpoint",
];
const SINGLE_ARGS = ["--webhook-id", WEBHOOK_ID];
const OPERATIONS = [
  {
    action: "create",
    args: CREATE_ARGS,
    method: "POST",
    suffix: "",
    write: true,
    body: { url: CALLBACK_URL, events: EVENT_TYPES, description: "test endpoint" },
    response: { ...ENDPOINT, signing_secret: SIGNING_SECRET },
    status: 201,
  },
  {
    action: "list",
    args: [],
    method: "GET",
    suffix: "",
    write: false,
    response: { data: [ENDPOINT], request_id: "request-list" },
  },
  {
    action: "get",
    args: SINGLE_ARGS,
    method: "GET",
    suffix: `/${ENCODED_WEBHOOK_ID}`,
    write: false,
    response: ENDPOINT,
  },
  {
    action: "update",
    args: [...SINGLE_ARGS, "--description", ""],
    method: "PUT",
    suffix: `/${ENCODED_WEBHOOK_ID}`,
    write: true,
    body: { description: "" },
    response: ENDPOINT,
  },
  {
    action: "delete",
    args: SINGLE_ARGS,
    method: "DELETE",
    suffix: `/${ENCODED_WEBHOOK_ID}`,
    write: true,
    response: { request_id: "request-delete" },
  },
  {
    action: "enable",
    args: SINGLE_ARGS,
    method: "POST",
    suffix: `/${ENCODED_WEBHOOK_ID}/enable`,
    write: true,
    response: ENDPOINT,
  },
  {
    action: "disable",
    args: SINGLE_ARGS,
    method: "POST",
    suffix: `/${ENCODED_WEBHOOK_ID}/disable`,
    write: true,
    response: { ...ENDPOINT, status: "DISABLED" },
  },
  {
    action: "test",
    args: SINGLE_ARGS,
    method: "POST",
    suffix: `/${ENCODED_WEBHOOK_ID}/test`,
    write: true,
    response: EVENT,
  },
  {
    action: "reset-secret",
    args: SINGLE_ARGS,
    method: "POST",
    suffix: `/${ENCODED_WEBHOOK_ID}/reset_secret`,
    write: true,
    response: {
      id: WEBHOOK_ID,
      signing_secret: SIGNING_SECRET,
      updated_at: "2026-09-14T01:00:00Z",
      request_id: "request-reset",
    },
  },
  {
    action: "events",
    args: [...SINGLE_ARGS, "--limit", "2", "--page", "opaque+/=&cursor"],
    method: "GET",
    suffix: `/${ENCODED_WEBHOOK_ID}/events`,
    write: false,
    response: { data: [DELIVERY_EVENT], next_page: "next+/=&cursor", request_id: "request-events" },
  },
];
const directories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup(config: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "bl-webhook-e2e-"));
  directories.push(directory);
  writeFileSync(join(directory, "config.json"), JSON.stringify(config));
  const env: NodeJS.ProcessEnv = {
    BAILIAN_CONFIG_DIR: directory,
    DASHSCOPE_API_KEY: "",
    DASHSCOPE_BASE_URL: "",
    BAILIAN_API_KEY: "",
    BAILIAN_BASE_URL: "",
    BAILIAN_WORKSPACE_ID: "",
    BAILIAN_E2E: "0",
    NODE_OPTIONS: "",
    NODE_USE_ENV_PROXY: "0",
    DASHSCOPE_QUIET: "0",
    DASHSCOPE_VERBOSE: "0",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NO_PROXY: "127.0.0.1,localhost",
  };
  return { directory, env };
}

function runWebhook(
  action: string,
  args: string[],
  environment: ReturnType<typeof setup>,
  overrides: NodeJS.ProcessEnv = {},
  outputFormat = "json",
  subprocess = false,
) {
  // Keep process startup, configuration overrides, timeout and text stdio coverage.
  const runner =
    subprocess ||
    args.includes("--timeout") ||
    Object.keys(overrides).length > 0 ||
    outputFormat === "text"
      ? runCommandE2e
      : runCommandInProcess;
  return runner(
    ROUTES,
    ["managed-agent", "webhook", action, ...args, "--output", outputFormat],
    { ...environment.env, ...overrides },
    { cwd: environment.directory },
  );
}

async function gateway(responseBody: unknown = ENDPOINT, status = 200, holdResponse = false) {
  const received: { method?: string; path?: string; headers: IncomingHttpHeaders; body: string }[] =
    [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method,
        path: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      if (holdResponse) return;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(responseBody));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
  return { origin: `http://127.0.0.1:${address.port}`, received };
}

describe("e2e: managed-agent Webhook discovery and validation", () => {
  test.each(OPERATIONS)(
    "$action help resolves with API Key authentication",
    async ({ action, write }) => {
      const result = await runCommandHelp(ROUTES, ["managed-agent", "webhook", action, "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(`Usage: bl managed-agent webhook ${action}`);
      expect(result.stderr).toContain("Authentication: API Key");
      expect(result.stderr).toContain("--workspace-id");
      expect(result.stderr).not.toContain("--console-site");
      expect(result.stderr).not.toContain("--provider");
      expect(result.stderr).not.toContain("--file");
      if (write) expect(result.stderr).toContain("--yes");
      else expect(result.stderr).not.toContain("--yes");
    },
  );

  test.each([
    { action: "create", args: ["--event", "session.updated"], missing: "--url" },
    { action: "create", args: ["--url", CALLBACK_URL], missing: "--event" },
    ...OPERATIONS.filter(({ action }) => !["create", "list"].includes(action)).map(
      ({ action }) => ({ action, args: [], missing: "--webhook-id" }),
    ),
  ])(
    "$action rejects missing $missing before authentication",
    async ({ action, args, missing }) => {
      const result = await runWebhook(
        action,
        [...args, "--dry-run", "--workspace-id", "ws-test"],
        setup(),
      );
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.message).toContain(missing);
    },
  );

  test.each([
    { action: "update", args: SINGLE_ARGS },
    { action: "create", args: ["--url", "not-a-url", "--event", "session.updated"] },
    {
      action: "create",
      args: ["--url", "ftp://example.test/hook", "--event", "session.updated"],
    },
    { action: "create", args: ["--url", CALLBACK_URL, "--event", " "] },
    { action: "create", args: ["--url", CALLBACK_URL, "--event", "session.*"] },
    { action: "update", args: [...SINGLE_ARGS, "--description", "字".repeat(257)] },
    { action: "get", args: ["--webhook-id", " "] },
    { action: "events", args: [...SINGLE_ARGS, "--page", " "] },
    ...["0", "101", "1.5"].map((limit) => ({
      action: "events",
      args: [...SINGLE_ARGS, "--limit", limit],
    })),
  ])("$action rejects invalid request values offline", async ({ action, args }) => {
    const result = await runWebhook(
      action,
      [...args, "--workspace-id", "ws-test", "--dry-run"],
      setup(),
    );
    expect(result.exitCode).toBe(2);
  });
});

describe("e2e: managed-agent Webhook confirmation and offline preview", () => {
  test.each(OPERATIONS.filter(({ write }) => write))(
    "$action requires --yes before any request",
    async ({ action, args }) => {
      const { origin, received } = await gateway();
      const environment = setup({ api_key: API_KEY, base_url: origin });
      const result = await runWebhook(action, args, environment);
      expect(result.exitCode).toBe(7);
      expect(JSON.parse(result.stderr)).toMatchObject({
        error: { code: 7, type: "requires_confirmation" },
      });
      expect(received).toEqual([]);
    },
  );

  test.each(OPERATIONS)(
    "$action dry-run needs neither credentials nor project files and performs no request",
    async ({ action, args, body }) => {
      const { origin, received } = await gateway();
      const environment = setup({ base_url: origin });
      const before = readdirSync(environment.directory);
      const result = await runWebhook(action, [...args, "--dry-run"], environment);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        operation: `webhook.${action}`,
        provider: "bailian",
        base_url: `${origin}${API_ROOT}`,
      });
      if (body) expect(parseStdoutJson(result.stdout)).toMatchObject({ request: body });
      if (!["create", "list"].includes(action))
        expect(parseStdoutJson(result.stdout)).toMatchObject({ webhook_id: WEBHOOK_ID });
      expect(received).toEqual([]);
      expect(readdirSync(environment.directory)).toEqual(before);
    },
  );

  test("SDK requests and previews ignore invalid YAML, State and project .env without modifying them", async () => {
    const { origin, received } = await gateway();
    const environment = setup({ api_key: API_KEY, base_url: origin });
    const files = {
      "agents.yaml": "invalid: [yaml",
      "agents.state.json": "{invalid",
      ".env": "BAILIAN_BASE_URL=https://unused.example.test\n",
    };
    for (const [name, content] of Object.entries(files))
      writeFileSync(join(environment.directory, name), content);
    const getResult = await runWebhook("get", SINGLE_ARGS, environment, {}, "json", true);
    expect(getResult.exitCode, getResult.stderr).toBe(0);
    expect(received).toHaveLength(1);
    const result = await runWebhook(
      "create",
      [...CREATE_ARGS, "--dry-run"],
      environment,
      {},
      "json",
      true,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(received).toHaveLength(1);
    for (const [name, content] of Object.entries(files))
      expect(readFileSync(join(environment.directory, name), "utf8")).toBe(content);
  });
});

describe("e2e: managed-agent Webhook SDK HTTP protocol", () => {
  test.each([false, true])(
    "create confirmation=%s matches subprocess stdout, stderr and exit code exactly",
    async (confirmed) => {
      const response = { ...ENDPOINT, signing_secret: SIGNING_SECRET };
      const { origin, received } = await gateway(response, 201);
      const environment = setup({ api_key: API_KEY, base_url: origin });
      const args = [...CREATE_ARGS, ...(confirmed ? ["--yes"] : [])];
      const inProcess = await runWebhook("create", args, environment);
      const subprocess = await runWebhook("create", args, environment, {}, "json", true);
      expect(inProcess).toEqual(subprocess);
      expect(inProcess.exitCode).toBe(confirmed ? 0 : 7);
      expect(received).toHaveLength(confirmed ? 2 : 0);
      if (confirmed) expect(parseStdoutJson(inProcess.stdout)).toEqual(response);
      expect(inProcess.stderr).not.toContain(SIGNING_SECRET);
      expect(inProcess.stderr).not.toContain(API_KEY);
    },
  );

  test.each(OPERATIONS)(
    "$action sends the exact SDK method/path/body and preserves the response",
    async ({ action, args, method, suffix, body, response, status, write }) => {
      const { origin, received } = await gateway(response, status);
      const environment = setup({ api_key: API_KEY, base_url: origin });
      const result = await runWebhook(
        action,
        [...args, ...(write ? ["--yes"] : []), "--verbose"],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toEqual(response);
      expect(received).toHaveLength(1);
      const request = received[0]!;
      expect(request.method).toBe(method);
      const url = new URL(request.path!, origin);
      expect(url.pathname).toBe(`${ENDPOINT_PATH}${suffix}`);
      expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(request.headers["x-access-token"]).toBeUndefined();
      if (body) expect(JSON.parse(request.body)).toEqual(body);
      else expect(request.body === "" || request.body === "{}").toBe(true);
      if (action === "events")
        expect(Object.fromEntries(url.searchParams)).toEqual({
          limit: "2",
          page: "opaque+/=&cursor",
        });
      else expect(url.search).toBe("");
      expect(result.stderr).not.toContain(API_KEY);
      expect(result.stderr).not.toContain(SIGNING_SECRET);
      expect(readdirSync(environment.directory)).toEqual(["config.json"]);
    },
  );

  test("update sends only supplied fields and preserves repeated events", async () => {
    const { origin, received } = await gateway();
    const result = await runWebhook(
      "update",
      [...SINGLE_ARGS, ...CREATE_ARGS, "--yes"],
      setup({ api_key: API_KEY, base_url: origin }),
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(received[0]!.body)).toEqual({
      url: CALLBACK_URL,
      events: EVENT_TYPES,
      description: "test endpoint",
    });
  });

  test("passes a future named subscription to the service without a local enum", async () => {
    const { origin, received } = await gateway();
    const result = await runWebhook(
      "update",
      [...SINGLE_ARGS, "--event", "future.event", "--yes"],
      setup({ api_key: API_KEY, base_url: origin }),
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(received[0]!.body)).toEqual({ events: ["future.event"] });
  });

  test.each(["create", "reset-secret"])(
    "%s keeps the signing secret in successful text output, including --quiet",
    async (action) => {
      const response = { ...ENDPOINT, signing_secret: SIGNING_SECRET };
      const { origin } = await gateway(response);
      const result = await runWebhook(
        action,
        [...(action === "create" ? CREATE_ARGS : SINGLE_ARGS), "--yes", "--quiet", "--verbose"],
        setup({ api_key: API_KEY, base_url: origin }),
        {},
        "text",
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(response);
      expect(result.stderr).not.toContain(SIGNING_SECRET);
      expect(result.stderr).not.toContain(API_KEY);
    },
  );

  test("missing API Key fails before opening the SDK connection", async () => {
    const { origin, received } = await gateway();
    const result = await runWebhook("get", SINGLE_ARGS, setup({ base_url: origin }));
    expect(result.exitCode).toBe(3);
    expect(received).toEqual([]);
  });

  test("terminal event pages preserve next_page null without adding has_more", async () => {
    const response = { data: [DELIVERY_EVENT], next_page: null, request_id: "request-last-page" };
    const { origin } = await gateway(response);
    const result = await runWebhook(
      "events",
      SINGLE_ARGS,
      setup({ api_key: API_KEY, base_url: origin }),
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toEqual(response);
  });

  test("runtime timeout aborts the SDK request", async () => {
    const { origin, received } = await gateway(undefined, 200, true);
    const startedAt = Date.now();
    const result = await runWebhook(
      "get",
      [...SINGLE_ARGS, "--timeout", "1"],
      setup({ api_key: API_KEY, base_url: origin }),
    );
    expect(result.exitCode).toBe(5);
    expect(received).toHaveLength(1);
    expect(Date.now() - startedAt).toBeLessThan(15_000);
    expect(result.stderr).not.toContain(API_KEY);
  });

  test.each([400, 401, 403, 429, 500])(
    "HTTP %s preserves service error text without exposing response secrets",
    async (status) => {
      const message = `Original Webhook service failure ${status}：原始错误`;
      const { origin, received } = await gateway(
        {
          code: "WebhookFailure",
          message,
          request_id: "request-failure",
          signing_secret: SIGNING_SECRET,
        },
        status,
      );
      const result = await runWebhook(
        "get",
        [...SINGLE_ARGS, "--verbose"],
        setup({ api_key: API_KEY, base_url: origin }),
      );
      expect(result.exitCode).toBe(1);
      const diagnostics = result.stderr
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
      const errors = diagnostics.filter((record) => record.error !== undefined);
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toMatchObject({
        message,
        request_id: "request-failure",
        http_status: status,
        api_code: "WebhookFailure",
      });
      expect(result.stdout).not.toContain(SIGNING_SECRET);
      expect(result.stderr).not.toContain(SIGNING_SECRET);
      expect(result.stderr).not.toContain(API_KEY);
      expect(received.length).toBeGreaterThanOrEqual(1);
    },
  );
});

describe("e2e: managed-agent Webhook CLI configuration precedence", () => {
  test.each(["flags", "environment", "profile"])(
    "%s selects SDK credentials and gateway without agents.yaml",
    async (source) => {
      const chosen = await gateway();
      const fallback = await gateway();
      const environment = setup({
        active_config: "webhooks",
        webhooks: {
          api_key: source === "profile" ? API_KEY : "sk-profile-lower-priority",
          base_url: source === "profile" ? chosen.origin : fallback.origin,
          workspace_id: "ws-profile",
        },
      });
      const args =
        source === "flags"
          ? ["--api-key", API_KEY, "--base-url", chosen.origin, "--workspace-id", "ws-flag"]
          : [];
      const overrides =
        source === "profile"
          ? {}
          : {
              DASHSCOPE_API_KEY: source === "environment" ? API_KEY : "sk-env-lower-priority",
              DASHSCOPE_BASE_URL: source === "environment" ? chosen.origin : fallback.origin,
              BAILIAN_WORKSPACE_ID: "ws-env",
            };
      const result = await runWebhook(
        "get",
        [...SINGLE_ARGS, ...args],
        environment,
        overrides,
        "json",
        true,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(chosen.received).toHaveLength(1);
      expect(chosen.received[0]!.headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(fallback.received).toEqual([]);
    },
  );

  test.each(["flags", "environment", "profile"])(
    "%s workspace supplies the default AgentStudio URL in dry-run",
    async (source) => {
      const environment = setup({ workspace_id: "ws-profile" });
      const args = source === "flags" ? ["--workspace-id", "ws-flag"] : [];
      const overrides = source === "profile" ? {} : { BAILIAN_WORKSPACE_ID: "ws-env" };
      const result = await runWebhook(
        "list",
        [...args, "--dry-run"],
        environment,
        overrides,
        "json",
        true,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      const workspace =
        source === "flags" ? "ws-flag" : source === "environment" ? "ws-env" : "ws-profile";
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        base_url: `https://${workspace}.cn-beijing.maas.aliyuncs.com${API_ROOT}`,
      });
    },
  );
});
