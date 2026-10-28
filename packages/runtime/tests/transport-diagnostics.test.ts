import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  Client,
  McpClient,
  createInstrumentedFetch,
  requestJson,
  type HttpDeps,
  type OutputMessage,
} from "bailian-cli-core";
import { createOutputReporter } from "../src/output/reporter.ts";

const identity = {
  binName: "test-cli",
  version: "0.0.0",
  npmPackage: "test-cli",
  clientName: "test-cli",
};
const settings = {
  output: "json" as const,
  outputExplicit: true,
  timeout: 5,
  watermark: true,
  verbose: true,
  quiet: true,
  dryRun: false,
  telemetry: false,
};

afterEach(() => vi.restoreAllMocks());

test.each(["http", "instrumented", "console", "openapi"])(
  "%s diagnostics use injected JSON writer without credentials",
  async (transport) => {
    let stderr = "";
    const reporter = createOutputReporter({
      settings,
      stderr: {
        write: (chunk) => {
          stderr += chunk;
        },
      },
    });
    const debug = (diagnostic: OutputMessage) => reporter.output.debug(diagnostic);
    const deps = { identity, settings, debug };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Success: true, Data: {} }), {
        headers: { "x-request-id": "request-demo" },
      }),
    );
    const legacy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new Client({
      ...deps,
      baseUrl: "https://example.invalid",
      apiCred: { token: "fake-api-secret", baseUrl: "https://example.invalid", source: "flag" },
      consoleCred: {
        token: "fake-console-secret",
        region: "cn-beijing",
        site: "domestic",
        source: "flag",
      },
      openApiCred: {
        accessKeyId: "fake-ak-secret",
        accessKeySecret: "fake-access-secret",
        source: "flag",
      },
    });
    if (transport === "http")
      await requestJson(deps, {
        url: "https://user:fake-password@example.invalid/task?api_key=fake-query-secret",
        headers: { Authorization: "Bearer fake-api-secret" },
      });
    if (transport === "instrumented")
      await createInstrumentedFetch(deps)("https://example.invalid/task?token=fake-query-secret", {
        headers: { Authorization: "Bearer fake-api-secret" },
      });
    if (transport === "console") await client.console("test.api", { api_key: "fake-body-secret" });
    if (transport === "openapi")
      await client.openApiJson({
        host: "example.invalid",
        path: "/",
        action: "List",
        version: "2026-01-01",
        method: "POST",
        body: { password: "fake-body-secret" },
      });
    expect(legacy).not.toHaveBeenCalled();
    const records = stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records.every((record) => record.debug)).toBe(true);
    expect(stderr).not.toMatch(/fake-(?:api|query|body|password|console|ak|access)-secret/);
  },
);

test("core transport is silent without a diagnostic callback", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  const legacy = vi.spyOn(console, "error").mockImplementation(() => {});
  await requestJson({ identity, settings } satisfies HttpDeps, { url: "https://example.invalid" });
  expect(legacy).not.toHaveBeenCalled();
});

test("MCP session diagnostics also use the callback", async () => {
  const records: OutputMessage[] = [];
  let stderr = "";
  const output = createOutputReporter({
    settings,
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  }).output;
  const legacy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    if (typeof init?.body !== "string") throw new Error("Expected RPC JSON body");
    const body = JSON.parse(init.body);
    return body.id === undefined
      ? new Response(null, { status: 202 })
      : new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              serverInfo: { name: "test" },
              instructions: "https://example.invalid/?token=fake-mcp-secret",
              customPayload: "private-user-content",
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
  });
  const client = new McpClient(
    {
      identity,
      settings,
      debug: (diagnostic) => {
        records.push(diagnostic);
        output.debug(diagnostic);
      },
    },
    "https://example.invalid/mcp",
    "fake-api-secret",
  );
  await client.initialize();
  expect(records.length).toBeGreaterThanOrEqual(3);
  expect(legacy).not.toHaveBeenCalled();
  expect(stderr).not.toContain("fake-mcp-secret");
  expect(stderr).not.toContain("private-user-content");
});
