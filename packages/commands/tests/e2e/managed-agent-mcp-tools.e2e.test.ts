import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNodeMain } from "e2e/runner";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { stringify } from "yaml";
import { commandsPackageRoot, parseStdoutJson } from "./helpers.ts";
import type { E2eRouteExports } from "./topic-routes.ts";

const ROUTES: E2eRouteExports = {
  "managed-agent validate": "managedAgentValidate",
  "managed-agent apply": "managedAgentApply",
  "managed-agent agent create": "managedAgentAgentCreate",
};
const API_PATH = "/api/v1/agentstudio";
const MCP_SERVER = "market-cmgjmcp00074952";
const AGENT_ID = "agent-mcp-tools-e2e";
const directories: string[] = [];
const servers: Server[] = [];
const OVERRIDES = [
  { name: "query_financial_data", enabled: true },
  { name: "export_financial_data", enabled: false },
];
const CONFIG_CASES = [
  { label: "omitted configs", configs: undefined },
  { label: "empty configs", configs: [] },
  { label: "explicit enabled and disabled overrides", configs: OVERRIDES },
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

function setup(origin: string) {
  const directory = mkdtempSync(join(tmpdir(), "bl-mcp-tools-e2e-"));
  directories.push(directory);
  writeFileSync(
    join(directory, "config.json"),
    JSON.stringify({ api_key: "test-mcp-tools-key", base_url: `${origin}${API_PATH}` }),
  );
  writeFileSync(join(directory, ".env"), "\n");
  return {
    directory,
    baseUrl: `${origin}${API_PATH}`,
    configPath: join(directory, "agents.yaml"),
    env: {
      BAILIAN_CONFIG_DIR: directory,
      AGENTS_CONFIG_PATH: join(directory, "provider-config.json"),
      AGENTS_PROVIDER: "bailian",
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

function writeProject(
  environment: ReturnType<typeof setup>,
  configs?: Array<{ name: string; enabled: boolean }>,
) {
  writeFileSync(
    environment.configPath,
    stringify({
      version: "1",
      providers: { bailian: { base_url: environment.baseUrl } },
      defaults: { provider: "bailian" },
      agents: {
        assistant: {
          model: "qwen3.8-max",
          instructions: "Use the financial data MCP tools.",
          tools: {
            builtin: ["bash"],
            mcp: [
              {
                type: "mcp_toolkit",
                mcp_server_name: MCP_SERVER,
                default_config: { enabled: true },
                ...(configs === undefined ? {} : { configs }),
              },
            ],
          },
          mcp_servers: [{ type: "official", name: MCP_SERVER }],
        },
      },
    }),
  );
}

function run(args: string[], environment: ReturnType<typeof setup>) {
  return runNodeMain(
    join(commandsPackageRoot, "tests/e2e/harness/main.ts"),
    ["managed-agent", ...args, "--output", "json"],
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

async function gateway() {
  const received: Array<{ method?: string; path: string; body: Record<string, unknown> }> = [];
  let agent: Record<string, unknown> | undefined;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const path = request.url ?? "";
      const text = Buffer.concat(chunks).toString("utf8");
      const body = text ? JSON.parse(text) : {};
      received.push({ method: request.method, path, body });
      if (
        request.method === "POST" &&
        (path === `${API_PATH}/agents` || path === `${API_PATH}/agents/${AGENT_ID}`)
      ) {
        agent = { ...body, id: AGENT_ID, version: "1" };
      } else if (
        !(request.method === "GET" && path === `${API_PATH}/agents/${AGENT_ID}` && agent)
      ) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ message: `Unexpected test request: ${request.method} ${path}` }),
        );
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(agent));
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

function expectMcpToolkit(body: Record<string, unknown>, configs = OVERRIDES) {
  expect(body.mcp_servers).toEqual([{ type: "official", name: MCP_SERVER }]);
  const tools = body.tools as Array<Record<string, unknown>>;
  expect(tools.filter((tool) => tool.type === "mcp_toolkit")).toEqual([
    {
      type: "mcp_toolkit",
      mcp_server_name: MCP_SERVER,
      default_config: { enabled: true },
      configs,
    },
  ]);
}

describe("e2e: managed-agent MCP defaults without placeholder tool configs (local HTTP)", () => {
  test.each(CONFIG_CASES)("validate and apply accept $label", async ({ configs }) => {
    const { origin, received } = await gateway();
    const environment = setup(origin);
    writeProject(environment, configs);
    const yamlBefore = readFileSync(environment.configPath, "utf8");

    const validated = await run(["validate"], environment);
    expect(validated.exitCode, validated.stderr).toBe(0);
    expect(parseStdoutJson(validated.stdout)).toMatchObject({ valid: true });
    expect(received).toEqual([]);

    const applied = await run(["apply", "--no-refresh", "--yes"], environment);
    expect(applied.exitCode, applied.stderr).toBe(0);
    expect(parseStdoutJson(applied.stdout)).toMatchObject({ succeeded: 1, failed: 0 });
    const mutations = received.filter((request) => request.method === "POST");
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ path: `${API_PATH}/agents` });
    expectMcpToolkit(mutations[0]!.body, configs ?? []);
    expect(readFileSync(environment.configPath, "utf8")).toBe(yamlBefore);
  });

  test("apply removes explicit overrides and sends an empty config list on update", async () => {
    const { origin, received } = await gateway();
    const environment = setup(origin);
    writeProject(environment, OVERRIDES);
    const created = await run(["apply", "--no-refresh", "--yes"], environment);
    expect(created.exitCode, created.stderr).toBe(0);
    expectMcpToolkit(received[0]!.body);
    received.splice(0);

    writeProject(environment);
    const applied = await run(["apply", "--no-refresh", "--yes"], environment);
    expect(applied.exitCode, applied.stderr).toBe(0);
    expect(parseStdoutJson(applied.stdout)).toMatchObject({ succeeded: 1, failed: 0 });
    const mutations = received.filter((request) => request.method === "POST");
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ path: `${API_PATH}/agents/${AGENT_ID}` });
    expectMcpToolkit(mutations[0]!.body, []);
  });

  test("agent create --mcp sends the market server with every tool enabled", async () => {
    const { origin, received } = await gateway();
    const environment = setup(origin);
    writeFileSync(
      environment.configPath,
      stringify({
        version: "1",
        providers: { bailian: { base_url: environment.baseUrl } },
        defaults: { provider: "bailian" },
      }),
    );

    const created = await run(
      [
        "agent",
        "create",
        "--name",
        "Finance Assistant",
        "--model",
        "qwen3.8-max",
        "--instructions",
        "Use the financial data MCP tools.",
        "--mcp",
        MCP_SERVER,
        "--mcp",
        MCP_SERVER,
        "--yes",
      ],
      environment,
    );
    expect(created.exitCode, created.stderr).toBe(0);
    expect(parseStdoutJson(created.stdout)).toMatchObject({
      status: "completed",
      agent: { key: "finance-assistant", remote_id: AGENT_ID, mcp: [MCP_SERVER] },
    });
    const mutations = received.filter((request) => request.method === "POST");
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ path: `${API_PATH}/agents` });
    expectMcpToolkit(mutations[0]!.body, []);
  });
});
