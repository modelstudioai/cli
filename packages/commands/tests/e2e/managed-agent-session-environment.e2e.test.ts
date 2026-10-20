import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { LocalFileStateBackend, StateManager } from "@openagentpack/sdk";
import { runNodeMain } from "e2e/runner";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { commandsPackageRoot, parseStdoutJson, runCommandHelp } from "./helpers.ts";
import type { E2eRouteExports } from "./topic-routes.ts";

const ROUTES: E2eRouteExports = {
  "managed-agent session create": "managedAgentSessionCreate",
  "managed-agent session run": "managedAgentSessionRun",
};
const directories: string[] = [];
const servers: Server[] = [];
const BASE_PATH = "/api/v1/agentstudio/sessions";
const SESSION_ID = "sess_environment_e2e";
const SESSION_PATH = `${BASE_PATH}/${SESSION_ID}`;
const AGENT_ID = "agent_environment_e2e";
const ENVIRONMENT_ID = "env_environment_e2e";
const ENVIRONMENT_ENTRIES = [
  "DUPLICATE=fake-old-value",
  " TRIMMED_KEY =  fake-spaced-value  ",
  "EMPTY=",
  "EQUALS=fake=value=with=equals",
  "DUPLICATE=fake-new-value",
];
const ENVIRONMENT_VARIABLES = {
  DUPLICATE: "fake-new-value",
  TRIMMED_KEY: "  fake-spaced-value  ",
  EMPTY: "",
  EQUALS: "fake=value=with=equals",
};
const ENVIRONMENT_ARGS = ENVIRONMENT_ENTRIES.flatMap((entry) => ["--environment_variables", entry]);
const EVENTS = [
  {
    id: "evt_assistant_environment_e2e",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Environment run completed." }],
  },
  {
    id: "evt_status_environment_e2e",
    type: "session_status",
    content: [{ type: "data", data: { session_status: "completed" } }],
  },
];

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
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function setup(config: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "bl-session-environment-e2e-"));
  directories.push(directory);
  writeFileSync(join(directory, "config.json"), JSON.stringify(config));
  writeFileSync(join(directory, "provider-config.json"), "{}");
  return {
    directory,
    env: {
      BAILIAN_CONFIG_DIR: directory,
      AGENTS_CONFIG_PATH: join(directory, "provider-config.json"),
      DASHSCOPE_API_KEY: "",
      DASHSCOPE_BASE_URL: "",
      BAILIAN_API_KEY: "",
      BAILIAN_BASE_URL: "",
      BAILIAN_WORKSPACE_ID: "",
      BAILIAN_E2E: "0",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      all_proxy: "",
      NO_PROXY: "127.0.0.1,localhost",
    },
  };
}

function sessionArgs(action: string) {
  return ["managed-agent", "session", action, ...(action === "run" ? ["--prompt", "hello"] : [])];
}

function run(args: string[], environment: ReturnType<typeof setup>) {
  return runNodeMain(
    join(commandsPackageRoot, "tests/e2e/harness/main.ts"),
    [...args, "--output", "json"],
    {
      cwd: environment.directory,
      env: {
        ...environment.env,
        BAILIAN_E2E_ROUTES: JSON.stringify(
          Object.entries(ROUTES).map(([path, exportName]) => ({ path, export: exportName })),
        ),
      },
    },
  );
}

async function seedProject(
  environment: ReturnType<typeof setup>,
  origin: string,
  agentEnvironmentVariables?: Record<string, string>,
) {
  const configPath = join(environment.directory, "agents.yaml");
  writeFileSync(
    configPath,
    [
      'version: "1"',
      "providers:",
      "  bailian:",
      '    api_key: ""',
      `    base_url: ${origin}/api/v1/agentstudio`,
      "environments:",
      "  sandbox:",
      `    environment_id: ${ENVIRONMENT_ID}`,
      "    config:",
      "      type: cloud",
      "agents:",
      "  assistant:",
      "    model: qwen3.8-max",
      "    instructions: Complete the test prompt.",
      "    environment: sandbox",
      "    provider: bailian",
      ...(agentEnvironmentVariables === undefined
        ? []
        : [`    environment_variables: ${JSON.stringify(agentEnvironmentVariables)}`]),
      "",
    ].join("\n"),
  );
  const backend = new LocalFileStateBackend({ configPath });
  const statePath = backend.getStatePath({ projectId: basename(environment.directory) });
  const state = StateManager.initialize(statePath);
  state.setResource({
    address: { type: "agent", name: "assistant", provider: "bailian" },
    remote_id: AGENT_ID,
    content_hash: "test-agent-hash",
    desired_hash: "test-agent-hash",
  });
  await state.save();
  return { configPath, statePath };
}

async function gateway(environmentVariables?: Record<string, string>) {
  const received: {
    method?: string;
    path: string;
    body: string;
    authorization?: string;
  }[] = [];
  const sessionResponse = {
    id: SESSION_ID,
    agent: { id: AGENT_ID },
    environment_id: ENVIRONMENT_ID,
    status: "completed",
    vault_ids: [],
    resources: [],
    server_note: "Preserve the original Session response.",
    ...(environmentVariables === undefined ? {} : { environment_variables: environmentVariables }),
  };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = request.url ?? "";
      received.push({
        method: request.method,
        path,
        body: Buffer.concat(chunks).toString("utf8"),
        authorization: request.headers.authorization,
      });
      if (request.method === "GET" && path === `${SESSION_PATH}/events/stream`) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(EVENTS.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
        return;
      }
      let body: unknown;
      if (
        (request.method === "POST" && path === BASE_PATH) ||
        (request.method === "GET" && path === SESSION_PATH)
      ) {
        body = sessionResponse;
      } else if (request.method === "POST" && path === `${SESSION_PATH}/events`) {
        body = { id: "evt_user_environment_e2e" };
      } else if (request.method === "GET" && path.startsWith(`${SESSION_PATH}/events?`)) {
        body = { data: EVENTS, has_more: false, next_page: null };
      } else {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ message: `Unexpected test request: ${request.method} ${path}` }),
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local server address.");
  return { origin: `http://127.0.0.1:${address.port}`, received, sessionResponse };
}

describe("e2e: managed-agent Session environment variable help and validation", () => {
  test.each(["create", "run"])("Session %s help documents repeatable variables", async (action) => {
    const result = await runCommandHelp(ROUTES, ["managed-agent", "session", action, "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("--environment_variables");
    expect(result.stderr).toContain("<KEY=VALUE>");
    expect(result.stderr).toContain("last value wins");
  });

  test.each(
    ["create", "run"].flatMap((action) =>
      [
        { entry: "fake-secret-without-separator", reason: "KEY=VALUE" },
        { entry: "   =fake-secret-without-key", reason: "keys must not be empty" },
      ].map((invalid) => ({ action, ...invalid })),
    ),
  )(
    "Session $action rejects $reason before authentication or HTTP",
    async ({ action, entry, reason }) => {
      const { origin, received } = await gateway();
      for (const config of [
        { base_url: origin },
        { base_url: origin, api_key: "test-session-key" },
      ]) {
        const environment = setup(config);
        const before = readdirSync(environment.directory);
        const result = await run(
          [...sessionArgs(action), "--environment_variables", entry, "--quiet"],
          environment,
        );
        expect(result.exitCode, result.stderr).toBe(2);
        expect(result.stderr).toContain("--environment_variables");
        expect(result.stderr).toContain(reason);
        expect(`${result.stdout}\n${result.stderr}`).not.toContain(entry);
        expect(readdirSync(environment.directory)).toEqual(before);
      }
      expect(received).toEqual([]);
    },
  );
});

describe("e2e: managed-agent Session environment variable offline preview", () => {
  test.each(["create", "run"])(
    "Session %s dry-run keeps keys and redacts every value",
    async (action) => {
      const { origin, received } = await gateway();
      const environment = setup({ base_url: origin });
      const before = readdirSync(environment.directory);
      const result = await run(
        [...sessionArgs(action), ...ENVIRONMENT_ARGS, "--dry-run"],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        [action === "create" ? "would_create_session" : "would_run"]: {
          environment_variables: Object.fromEntries(
            Object.keys(ENVIRONMENT_VARIABLES).map((key) => [key, "[REDACTED]"]),
          ),
        },
      });
      for (const value of Object.values(ENVIRONMENT_VARIABLES).filter(Boolean)) {
        expect(`${result.stdout}\n${result.stderr}`).not.toContain(value);
      }
      expect(`${result.stdout}\n${result.stderr}`).not.toContain("fake-old-value");
      expect(received).toEqual([]);
      expect(readdirSync(environment.directory)).toEqual(before);
    },
  );

  test.each(["create", "run"])("Session %s dry-run omits unspecified variables", async (action) => {
    const result = await run([...sessionArgs(action), "--dry-run"], setup());
    expect(result.exitCode, result.stderr).toBe(0);
    const output = parseStdoutJson(result.stdout) as Record<string, Record<string, unknown>>;
    expect(output[action === "create" ? "would_create_session" : "would_run"]).not.toHaveProperty(
      "environment_variables",
    );
  });
});

describe("e2e: managed-agent Session environment variable SDK HTTP protocol", () => {
  test.each(["create", "run"])(
    "Session %s rejects inherited Agent YAML variables before HTTP",
    async (action) => {
      const { origin, received } = await gateway();
      const environment = setup({ base_url: origin, api_key: "test-session-key" });
      const inheritedValue = "fake-inherited-agent-secret";
      const { configPath, statePath } = await seedProject(environment, origin, {
        YAML_ONLY: inheritedValue,
      });
      const originalConfig = readFileSync(configPath, "utf8");
      const originalState = readFileSync(statePath, "utf8");
      const result = await run(sessionArgs(action), environment);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain("environment_variables");
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(inheritedValue);
      expect(received).toEqual([]);
      expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
      expect(readFileSync(statePath, "utf8")).toBe(originalState);
    },
  );

  test.each([true, false])(
    "Session create sends variables only when provided (%s)",
    async (provided) => {
      const variables = provided ? ENVIRONMENT_VARIABLES : undefined;
      const { origin, received, sessionResponse } = await gateway(variables);
      const environment = setup({ base_url: origin, api_key: "test-session-key" });
      const { configPath, statePath } = await seedProject(environment, origin);
      const originalConfig = readFileSync(configPath, "utf8");
      const originalState = readFileSync(statePath, "utf8");
      const result = await run(
        [...sessionArgs("create"), ...(provided ? ENVIRONMENT_ARGS : [])],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        agent: "assistant",
        session: { id: SESSION_ID, attributes: sessionResponse },
      });
      const output = parseStdoutJson(result.stdout) as { session: Record<string, unknown> };
      if (provided) expect(output.session.environment_variables).toEqual(ENVIRONMENT_VARIABLES);
      else expect(output.session).not.toHaveProperty("environment_variables");
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        method: "POST",
        path: BASE_PATH,
        authorization: "Bearer test-session-key",
      });
      expect(JSON.parse(received[0]!.body)).toEqual({
        agent: AGENT_ID,
        environment_id: ENVIRONMENT_ID,
        ...(provided ? { environment_variables: ENVIRONMENT_VARIABLES } : {}),
      });
      expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
      expect(readFileSync(statePath, "utf8")).toBe(originalState);
    },
  );

  test.each(["streaming", "polling"])("Session run forwards variables through %s", async (mode) => {
    const { origin, received } = await gateway(ENVIRONMENT_VARIABLES);
    const environment = setup({ base_url: origin, api_key: "test-session-key" });
    const { configPath, statePath } = await seedProject(environment, origin);
    const originalConfig = readFileSync(configPath, "utf8");
    const originalState = readFileSync(statePath, "utf8");
    const result = await run(
      [...sessionArgs("run"), ...ENVIRONMENT_ARGS, ...(mode === "polling" ? ["--no-stream"] : [])],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      session_id: SESSION_ID,
      provider: "bailian",
      agent: "assistant",
      events: expect.arrayContaining([
        expect.objectContaining({
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Environment run completed." }],
          metadata: { display_bucket: "message" },
        }),
        expect.objectContaining({
          type: "session_status",
          metadata: { display_bucket: "status", status: "completed" },
        }),
      ]),
    });
    expect(received[0]).toMatchObject({ method: "POST", path: BASE_PATH });
    expect(JSON.parse(received[0]!.body)).toEqual({
      agent: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      environment_variables: ENVIRONMENT_VARIABLES,
    });
    const sent = received.find(
      (request) => request.method === "POST" && request.path === `${SESSION_PATH}/events`,
    );
    expect(sent).toBeDefined();
    expect(JSON.parse(sent!.body)).toEqual({
      input: [{ role: "user", type: "message", content: [{ type: "text", text: "hello" }] }],
    });
    const requestedPaths = received.map((request) => ({
      method: request.method,
      path: request.path,
    }));
    expect(requestedPaths).toHaveLength(mode === "polling" ? 4 : 3);
    if (mode === "polling") {
      expect(requestedPaths).toContainEqual({ method: "GET", path: SESSION_PATH });
      expect(requestedPaths).toContainEqual({
        method: "GET",
        path: `${SESSION_PATH}/events?limit=100`,
      });
    } else {
      expect(requestedPaths).toContainEqual({
        method: "GET",
        path: `${SESSION_PATH}/events/stream`,
      });
    }
    for (const request of received) expect(request.authorization).toBe("Bearer test-session-key");
    expect(readFileSync(configPath, "utf8")).toBe(originalConfig);
    expect(readFileSync(statePath, "utf8")).toBe(originalState);
  });
});
