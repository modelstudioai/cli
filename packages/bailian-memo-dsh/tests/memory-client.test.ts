import { describe, expect, it, vi } from "vite-plus/test";
import { MemoryClient } from "../src/memory-client.ts";

describe("MemoryClient", () => {
  it("posts search with bearer auth", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedInit = init;
      return Response.json({
        memory_nodes: [{ memory_node_id: "n1", content: "hi", score: 0.9 }],
      });
    });
    const client = new MemoryClient({
      resolveApiKey: async () => "test-key",
      resolveWorkspaceId: async () => "ws-1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.search({ userId: "u1", query: "hello", topK: 3 });
    expect(result.memory_nodes?.[0]?.memory_node_id).toBe("n1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(requestedUrl).toContain("ws-1.cn-beijing.maas.aliyuncs.com");
    expect(requestedUrl).toContain("/memory_nodes/search");
    expect(requestedInit?.headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
  });

  it("surfaces HTTP errors without rewriting server message", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "Forbidden", message: "no access" }), {
          status: 403,
        }),
    );
    const client = new MemoryClient({
      resolveApiKey: async () => "k",
      resolveWorkspaceId: async () => "ws",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.deleteNode("node-1")).rejects.toThrow(/no access/);
  });

  it("describes search scope with hashes and lengths but no identity or content", async () => {
    const client = new MemoryClient({
      resolveApiKey: async () => "secret-key",
      resolveWorkspaceId: async () => "workspace-sensitive",
    });
    const diagnostic = await client.describeSearchScope({
      userId: "user-sensitive",
      query: "private query",
      topK: 5,
      memoryTypes: ["observation"],
      planVersion: "pro",
    });
    const serialized = JSON.stringify(diagnostic);

    expect(serialized).not.toContain("workspace-sensitive");
    expect(serialized).not.toContain("user-sensitive");
    expect(serialized).not.toContain("private query");
    expect(diagnostic).toMatchObject({
      endpointHost: "cn-beijing.maas.aliyuncs.com",
      workspaceId: { length: 19 },
      userId: { length: 14 },
      messages: [{ role: "user", content: { length: 13 } }],
      topK: 5,
      minScore: null,
      memoryTypes: ["observation"],
      planVersion: "pro",
      memoryLibraryId: null,
      projectIds: null,
    });
  });
});

it("resolves the unique rule afresh using current credentials and never creates a schema", async () => {
  let workspace = "ws-one";
  let key = "key-one";
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    expect(href).toContain(`${workspace}.cn-beijing.maas.aliyuncs.com`);
    expect(init?.method).toBe("GET");
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${key}` });
    expect(href).not.toContain("memory_library_id");
    return Response.json({ total: 1, profile_schemas: [{ profile_schema_id: workspace }] });
  });
  const client = new MemoryClient({
    resolveApiKey: async () => key,
    resolveWorkspaceId: async () => workspace,
    fetchImpl,
  });
  expect(await client.getProfileSchemaId()).toBe("ws-one");
  workspace = "ws-two";
  key = "key-two";
  expect(await client.getProfileSchemaId()).toBe("ws-two");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("defaults to the last rule across pages and validates explicit selection", async () => {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = input as URL;
    const rows =
      url.searchParams.get("page_num") === "1"
        ? [{ profile_schema_id: "first", name: "First" }]
        : [{ profile_schema_id: "last", name: "Last" }];
    return Response.json({ total: 2, profile_schemas: rows });
  });
  const client = new MemoryClient({
    resolveApiKey: async () => "key",
    resolveWorkspaceId: async () => "ws",
    fetchImpl,
  });
  expect(await client.getProfileSchemaId()).toBe("last");
  expect(await client.getProfileSchemaId("first")).toBe("first");
  await expect(client.getProfileSchemaId("deleted")).rejects.toThrow(/selected profile rule/i);
});

it("returns no profile when there is no rule, and search stays independent", async () => {
  const fetchImpl = vi.fn(async () => Response.json({ total: 0, profile_schemas: [] }));
  const client = new MemoryClient({
    resolveApiKey: async () => "key",
    resolveWorkspaceId: async () => "ws",
    fetchImpl,
  });
  expect(await client.getCurrentProfile("user")).toEqual({ profile: { attributes: [] } });
  expect(fetchImpl).toHaveBeenCalledOnce();
  fetchImpl.mockClear();
  await client.search({ userId: "user", query: "hello" });
  expect(fetchImpl).toHaveBeenCalledOnce();
  const [url, options] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.pathname).toContain("memory_nodes/search");
  expect(JSON.parse(options.body as string)).not.toHaveProperty("profile_schema");
});
