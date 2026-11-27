import { expect, test, vi } from "vite-plus/test";
import command from "../src/commands/connector/call.ts";
import search from "../src/commands/connector/tools.ts";
import schema from "../src/commands/connector/schema.ts";

const selection = { tool: "calendar.list", instance: "account", traceId: "trace" };
const lookup = { instanceId: "account", toolRefs: ["calendar.list"], traceId: "trace" };
const schemaResponse = {
  instanceId: "account",
  schemas: [
    {
      toolRef: "calendar.list",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "integer" } },
        required: ["limit"],
      },
    },
  ],
};

function fixture(response: unknown = schemaResponse, json = '{"limit":2}') {
  const callTool = vi
    .fn()
    .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(response) }] })
    .mockResolvedValueOnce({ structuredContent: { results: [{ meetings: [] }] }, content: [] });
  const close = vi.fn();
  const output = vi.fn();
  const ctx = {
    settings: { workspaceId: "ws-test" },
    flags: { ...selection, json, query: "find meetings" },
    identity: { binName: "bl" },
    client: { connectBailianMcp: vi.fn().mockResolvedValue({ client: { callTool, close } }) },
    output: { result: output },
  };
  return {
    ctx: ctx as unknown as Parameters<typeof command.run>[0] & Parameters<typeof search.run>[0],
    callTool,
    close,
    output,
  };
}

test("discovery only sends query, retaining account selection and trace", async () => {
  const data = { traceId: "t", status: "MATCH", items: [{ requiresAccountSelection: true }] };
  const f = fixture(data);
  await search.run(f.ctx);
  expect(f.callTool.mock.calls).toEqual([["CONNECTOR_SEARCH_TOOL", { query: "find meetings" }]]);
  expect(f.output).toHaveBeenCalledWith(data);
});

test("schema returns decoded schema for the requested instance", async () => {
  const f = fixture();
  await schema.run(f.ctx);
  expect(f.callTool.mock.calls).toEqual([["CONNECTOR_GET_TOOL_SCHEMAS", lookup]]);
  expect(f.output).toHaveBeenCalledWith(schemaResponse);
});

test("call validates and reuses the selected tool, instance and trace", async () => {
  const f = fixture();
  await command.run(f.ctx);
  expect(f.callTool.mock.calls).toEqual([
    ["CONNECTOR_GET_TOOL_SCHEMAS", lookup],
    [
      "CONNECTOR_MULTI_EXECUTE_TOOL",
      {
        traceId: "trace",
        executions: [{ instanceId: "account", toolRef: "calendar.list", arguments: { limit: 2 } }],
      },
    ],
  ]);
  expect(f.output).toHaveBeenCalledWith({ results: [{ meetings: [] }] });
  expect(f.close).toHaveBeenCalledTimes(1);
});

test.each([
  [schemaResponse, '{"limit":"wrong"}'],
  [{ ...schemaResponse, instanceId: "different" }, "{}"],
  [{ ...schemaResponse, schemas: [] }, "{}"],
] as const)("schema or argument mismatch stops before execution", async (response, json) => {
  const f = fixture(response, json);
  await expect(command.run(f.ctx)).rejects.toThrow();
  expect(f.callTool).toHaveBeenCalledTimes(1);
  expect(f.close).toHaveBeenCalledTimes(1);
});
