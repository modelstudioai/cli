import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  LocalFileStateBackend,
  planProjectWithStateBackend,
  resolveProjectConfig,
} from "@openagentpack/sdk";
import { runNodeMain } from "e2e/runner";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parse, parseDocument } from "yaml";
import { commandsPackageRoot, parseStdoutJson, runCommandHelp } from "./helpers.ts";
import type { E2eRouteExports } from "./topic-routes.ts";

const ROUTES: E2eRouteExports = {
  "managed-agent deployment create": "managedAgentDeploymentCreate",
  "managed-agent apply": "managedAgentApply",
  "managed-agent plan": "managedAgentPlan",
};
const directories: string[] = [];
const servers: Server[] = [];
const API_PATH = "/api/v1/agentstudio";
const DEPLOYMENT_KEY = "daily-report";
const DEPLOYMENT_ID = "dep_environment_e2e";
const DEPLOYMENT_PATH = `${API_PATH}/deployments/${DEPLOYMENT_ID}`;
const AGENT_ID = "agent_environment_e2e";
const ENVIRONMENT_ID = "env_environment_e2e";
const CREATE_ARGS = [
  "managed-agent",
  "deployment",
  "create",
  "--name",
  "Daily Report",
  "--agent",
  "assistant",
  "--message",
  "Generate the report",
];
const ENVIRONMENT_ENTRIES = [
  "DUPLICATE=fake-old-deployment-value",
  " TRIMMED_KEY =  fake-spaced-deployment-value  ",
  "EMPTY=",
  "EQUALS=fake=deployment=value",
  "DUPLICATE=fake-new-deployment-value",
];
const ENVIRONMENT_VARIABLES = {
  DUPLICATE: "fake-new-deployment-value",
  TRIMMED_KEY: "  fake-spaced-deployment-value  ",
  EMPTY: "",
  EQUALS: "fake=deployment=value",
};
const ENVIRONMENT_ARGS = ENVIRONMENT_ENTRIES.flatMap((entry) => ["--environment_variables", entry]);
const UPDATE_CASES: Array<{ label: string; variables?: Record<string, string> }> = [
  { label: "change", variables: { CHANGED: "fake-updated-deployment-value", EMPTY: "" } },
  { label: "empty object", variables: {} },
  { label: "remove field", variables: undefined },
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
  const directory = mkdtempSync(join(tmpdir(), "bl-deployment-environment-e2e-"));
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

function run(
  args: string[],
  environment: ReturnType<typeof setup>,
  format: "json" | "text" = "json",
) {
  return runNodeMain(
    join(commandsPackageRoot, "tests/e2e/harness/main.ts"),
    [...args, "--output", format],
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

function snapshot(directory: string) {
  return Object.fromEntries(
    readdirSync(directory)
      .sort()
      .map((filename) => [filename, readFileSync(join(directory, filename), "utf8")]),
  );
}

function expectNoVariableValues(output: string, variables = ENVIRONMENT_VARIABLES) {
  for (const value of Object.values(variables).filter(Boolean)) {
    expect(output).not.toContain(value);
  }
  expect(output).not.toContain("fake-old-deployment-value");
}

async function seedProject(
  environment: ReturnType<typeof setup>,
  origin: string,
  options: { deploymentVariables?: Record<string, string>; unrelatedStore?: boolean } = {},
) {
  const configPath = join(environment.directory, "agents.yaml");
  writeFileSync(
    configPath,
    [
      'version: "1"',
      "# Preserve this existing project comment.",
      "providers:",
      "  bailian:",
      "    api_key: test-deployment-key",
      `    base_url: ${origin}${API_PATH}`,
      "defaults:",
      "  provider: bailian",
      "environments:",
      "  sandbox:",
      `    environment_id: ${ENVIRONMENT_ID}`,
      "    config:",
      "      type: cloud",
      "agents:",
      "  assistant:",
      "    name: Assistant",
      "    model: qwen3.8-max",
      "    instructions: Complete the test prompt.",
      "    environment: sandbox",
      "    provider: bailian",
      ...(options.unrelatedStore
        ? [
            "memory_stores:",
            "  other:",
            "    name: Keep these unrelated notes",
            '    description: ""',
            "    provider: bailian",
          ]
        : []),
      ...(options.deploymentVariables === undefined
        ? []
        : [
            "deployments:",
            `  ${DEPLOYMENT_KEY}:`,
            "    name: Daily Report",
            "    agent: assistant",
            "    provider: bailian",
            "    initial_events:",
            "      - type: user.message",
            "        content: Generate the report",
            `    environment_variables: ${JSON.stringify(options.deploymentVariables)}`,
          ]),
      "",
    ].join("\n"),
  );
  const loaded = await resolveProjectConfig(configPath, { resolveEnv: false });
  const stateBackend = new LocalFileStateBackend({ configPath });
  const stateScope = { projectId: loaded.projectName };
  const planned = await planProjectWithStateBackend(
    {
      projectName: loaded.projectName,
      config: loaded.config,
      configPath,
      providers: loaded.config.providers,
      stateBackend,
      stateScope,
    },
    { provider: "bailian", refresh: false, quiet: true },
  );
  await stateBackend.write(stateScope, (state) => {
    for (const resource of [
      { type: "agent" as const, name: "assistant", remoteId: AGENT_ID },
      { type: "environment" as const, name: "sandbox", remoteId: ENVIRONMENT_ID },
    ]) {
      const address = { type: resource.type, name: resource.name, provider: "bailian" };
      const action = planned.plan.actions.find(
        (entry) => entry.address.type === resource.type && entry.address.name === resource.name,
      );
      const contentHash = (action?.after as { content_hash?: string } | undefined)?.content_hash;
      if (!contentHash)
        throw new Error(`Missing desired hash for ${resource.type}.${resource.name}.`);
      state.setResource({
        address,
        remote_id: resource.remoteId,
        content_hash: contentHash,
        desired_hash: contentHash,
        ...(resource.type === "environment" ? { externally_managed: true } : {}),
      });
    }
  });
  return configPath;
}

async function gateway() {
  const received: { method?: string; path: string; body: string; authorization?: string }[] = [];
  let deployment: Record<string, unknown> | undefined;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = request.url ?? "";
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({
        method: request.method,
        path,
        body,
        authorization: request.headers.authorization,
      });
      let responseBody: unknown;
      if (request.method === "GET" && path === `${API_PATH}/agents/${AGENT_ID}`) {
        responseBody = {
          id: AGENT_ID,
          name: "Assistant",
          model: { id: "qwen3.8-max" },
          system: "Complete the test prompt.",
          tools: [{ type: "builtin_toolkit", default_config: { enabled: true }, configs: [] }],
          skills: [],
        };
      } else if (
        request.method === "GET" &&
        path === `${API_PATH}/environments/${ENVIRONMENT_ID}`
      ) {
        responseBody = {
          id: ENVIRONMENT_ID,
          config: { type: "cloud", networking: { type: "unrestricted" } },
        };
      } else if (request.method === "POST" && path === `${API_PATH}/deployments`) {
        deployment = {
          ...JSON.parse(body),
          id: DEPLOYMENT_ID,
          type: "deployment",
          status: "ready",
        };
        responseBody = deployment;
      } else if (request.method === "GET" && path === DEPLOYMENT_PATH && deployment) {
        responseBody = deployment;
      } else if (request.method === "POST" && path === DEPLOYMENT_PATH && deployment) {
        deployment = { ...deployment, ...JSON.parse(body) };
        responseBody = deployment;
      } else {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ message: `Unexpected test request: ${request.method} ${path}` }),
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(responseBody));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local server address.");
  return { origin: `http://127.0.0.1:${address.port}`, received };
}

function expectedCreateBody(directory: string, variables?: Record<string, string>) {
  return {
    name: "Daily Report",
    agent: { id: AGENT_ID },
    environment_id: ENVIRONMENT_ID,
    initial_events: [
      { role: "user", type: "message", content: [{ type: "text", text: "Generate the report" }] },
    ],
    metadata: { "agents.project": basename(directory), "agents.resource": DEPLOYMENT_KEY },
    ...(variables === undefined ? {} : { environment_variables: variables }),
  };
}

describe("e2e: managed-agent Deployment environment variable help and validation", () => {
  test("Deployment create help documents repeatable variables", async () => {
    const result = await runCommandHelp(ROUTES, [
      "managed-agent",
      "deployment",
      "create",
      "--help",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("--environment_variables");
    expect(result.stderr).toContain("<KEY=VALUE>");
    expect(result.stderr).toContain("last value wins");
  });

  test.each([
    { entry: "fake-secret-without-separator", reason: "KEY=VALUE" },
    { entry: "   =fake-secret-without-key", reason: "keys must not be empty" },
    { entry: "__proto__=fake-proto-value", reason: "__proto__" },
  ])("rejects $reason before authentication, HTTP, or YAML writes", async ({ entry, reason }) => {
    const { origin, received } = await gateway();
    for (const config of [
      { base_url: origin },
      { base_url: origin, api_key: "test-deployment-key" },
    ]) {
      const environment = setup(config);
      writeFileSync(join(environment.directory, "agents.yaml"), 'version: "1"\n');
      const before = snapshot(environment.directory);
      const result = await run(
        [...CREATE_ARGS, "--environment_variables", entry, "--yes"],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain("environment_variables");
      expect(result.stderr).toContain(reason);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(entry);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain("fake-secret");
      expect(`${result.stdout}\n${result.stderr}`).not.toContain("fake-proto-value");
      expect(snapshot(environment.directory)).toEqual(before);
    }
    expect(received).toEqual([]);
  });
});

describe("e2e: managed-agent Deployment environment variable previews", () => {
  test.each([true, false])(
    "dry-run performs no writes or requests with variables (%s)",
    async (provided) => {
      const { origin, received } = await gateway();
      const environment = setup({ base_url: origin });
      await seedProject(environment, origin, { unrelatedStore: true });
      const before = snapshot(environment.directory);
      const result = await run(
        [...CREATE_ARGS, ...(provided ? ENVIRONMENT_ARGS : []), "--dry-run"],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        resource: { type: "deployment", key: DEPLOYMENT_KEY, provider: "bailian" },
        yaml_written: false,
        ready_to_create: true,
        requires_confirmation: false,
        actions: expect.arrayContaining([
          expect.objectContaining({
            action: "create",
            address: expect.objectContaining({ type: "deployment", name: DEPLOYMENT_KEY }),
          }),
        ]),
      });
      expectNoVariableValues(`${result.stdout}\n${result.stderr}`);
      expect(received).toEqual([]);
      expect(snapshot(environment.directory)).toEqual(before);
    },
  );

  test("default preview checks dependencies and keeps YAML and State unchanged", async () => {
    const { origin, received } = await gateway();
    const environment = setup({ base_url: origin, api_key: "test-deployment-key" });
    await seedProject(environment, origin, { unrelatedStore: true });
    const before = snapshot(environment.directory);
    const result = await run([...CREATE_ARGS, ...ENVIRONMENT_ARGS], environment);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      yaml_written: false,
      requires_confirmation: true,
      ready_to_create: true,
    });
    expectNoVariableValues(`${result.stdout}\n${result.stderr}`);
    expect(received.length).toBeGreaterThan(0);
    expect(received.every((request) => request.method === "GET")).toBe(true);
    expect(received.some((request) => request.path.includes("memory_stores"))).toBe(false);
    expect(snapshot(environment.directory)).toEqual(before);
  });
});

describe("e2e: managed-agent Deployment environment variable SDK HTTP protocol", () => {
  test.each([true, false])(
    "scoped create persists YAML and sends variables only when provided (%s)",
    async (provided) => {
      const { origin, received } = await gateway();
      const environment = setup({ base_url: origin, api_key: "test-deployment-key" });
      const configPath = await seedProject(environment, origin, { unrelatedStore: true });
      const before = parse(readFileSync(configPath, "utf8"));
      const result = await run(
        [...CREATE_ARGS, ...(provided ? ENVIRONMENT_ARGS : []), "--yes"],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        resource: { type: "deployment", key: DEPLOYMENT_KEY, remote_id: DEPLOYMENT_ID },
        yaml_written: true,
      });
      const written = readFileSync(configPath, "utf8");
      const config = parse(written);
      expect(config.deployments[DEPLOYMENT_KEY]).toMatchObject({
        name: "Daily Report",
        agent: "assistant",
        initial_events: [{ type: "user.message", content: "Generate the report" }],
      });
      if (provided)
        expect(config.deployments[DEPLOYMENT_KEY].environment_variables).toEqual(
          ENVIRONMENT_VARIABLES,
        );
      else expect(config.deployments[DEPLOYMENT_KEY]).not.toHaveProperty("environment_variables");
      for (const group of ["providers", "defaults", "environments", "agents", "memory_stores"])
        expect(config[group]).toEqual(before[group]);
      expect(written).toContain("# Preserve this existing project comment.");
      const mutations = received.filter((request) => request.method !== "GET");
      expect(mutations).toHaveLength(1);
      expect(mutations[0]).toMatchObject({
        method: "POST",
        path: `${API_PATH}/deployments`,
        authorization: "Bearer test-deployment-key",
      });
      expect(JSON.parse(mutations[0]!.body)).toEqual(
        expectedCreateBody(environment.directory, provided ? ENVIRONMENT_VARIABLES : undefined),
      );
      expect(received.some((request) => request.path.includes("memory_stores"))).toBe(false);
    },
  );

  test.each(UPDATE_CASES)("YAML apply manages variables: $label", async ({ variables }) => {
    const { origin, received } = await gateway();
    const environment = setup({ base_url: origin, api_key: "test-deployment-key" });
    const configPath = await seedProject(environment, origin, {
      deploymentVariables: ENVIRONMENT_VARIABLES,
    });
    const created = await run(["managed-agent", "apply", "--no-refresh", "--yes"], environment);
    expect(created.exitCode, created.stderr).toBe(0);
    const createRequests = received.filter((request) => request.method === "POST");
    expect(createRequests).toHaveLength(1);
    expect(JSON.parse(createRequests[0]!.body)).toEqual(
      expectedCreateBody(environment.directory, ENVIRONMENT_VARIABLES),
    );
    received.splice(0);

    const document = parseDocument(readFileSync(configPath, "utf8"));
    if (variables === undefined)
      document.deleteIn(["deployments", DEPLOYMENT_KEY, "environment_variables"]);
    else document.setIn(["deployments", DEPLOYMENT_KEY, "environment_variables"], variables);
    writeFileSync(configPath, document.toString());
    const beforePreview = snapshot(environment.directory);
    for (const format of ["json", "text"] as const) {
      const preview = await run(["managed-agent", "plan", "--dry-run"], environment, format);
      expect(preview.exitCode, preview.stderr).toBe(0);
      expectNoVariableValues(`${preview.stdout}\n${preview.stderr}`);
      if (variables) {
        for (const value of Object.values(variables).filter(Boolean))
          expect(`${preview.stdout}\n${preview.stderr}`).not.toContain(value);
      }
      if (format === "json") {
        expect(parseStdoutJson(preview.stdout)).toMatchObject({
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: "update",
              address: expect.objectContaining({ type: "deployment", name: DEPLOYMENT_KEY }),
            }),
          ]),
        });
      }
      expect(received).toEqual([]);
      expect(snapshot(environment.directory)).toEqual(beforePreview);
    }

    const applied = await run(["managed-agent", "apply", "--no-refresh", "--yes"], environment);
    expect(applied.exitCode, applied.stderr).toBe(0);
    expect(parseStdoutJson(applied.stdout)).toMatchObject({ succeeded: 1, failed: 0 });
    const mutations = received.filter((request) => request.method !== "GET");
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      method: "POST",
      path: DEPLOYMENT_PATH,
      authorization: "Bearer test-deployment-key",
    });
    expect(JSON.parse(mutations[0]!.body)).toEqual({
      ...expectedCreateBody(environment.directory, variables ?? {}),
      description: "",
      vault_ids: [],
      resources: [],
      schedule: null,
    });
    expect(received).toContainEqual(
      expect.objectContaining({ method: "GET", path: DEPLOYMENT_PATH }),
    );
    expect(readFileSync(configPath, "utf8")).toBe(beforePreview["agents.yaml"]);
  });
});
