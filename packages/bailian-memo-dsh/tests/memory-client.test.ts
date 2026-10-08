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
