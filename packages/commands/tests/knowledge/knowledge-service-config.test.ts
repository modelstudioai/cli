import { afterEach, expect, test, vi } from "vite-plus/test";
import update from "../../src/commands/knowledge/service-update.ts";
import get from "../../src/commands/knowledge/service-get.ts";
const config = {
  temperature: 0.2,
  kb_search_configs: [
    {
      id: "index-test",
      rerank: { model_name: "qwen3-vl-rerank", rerank_top_n: 5, rerank_min_score: 0.2 },
    },
  ],
  hybrid_rerank: { model_name: "qwen3-vl-rerank", rerank_top_n: 5 },
  future: { preserved: true },
};
afterEach(() => vi.restoreAllMocks());
test("scalar updates retain per-index ranking, hybrid ranking and unknown fields", async () => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const requestJson = vi
    .fn()
    .mockResolvedValueOnce({
      data: { agent_details: [{ agent_version: "beta", agent_config: config }] },
    })
    .mockResolvedValueOnce({ data: { agent_id: "agent-test" } });
  await update.run({
    flags: { agentId: "agent-test", temperature: 0.5, workspaceId: "ws_test" },
    settings: { output: "json" },
    client: { requestJson },
  } as unknown as Parameters<typeof update.run>[0]);
  expect(requestJson.mock.calls[1]![0].body.agent_config).toEqual({ ...config, temperature: 0.5 });
});
test("service text surfaces per-index and hybrid rerank config", async () => {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  const requestJson = vi.fn().mockResolvedValue({
    data: { agent_details: [{ agent_version: "beta", agent_config: config }] },
  });
  await get.run({
    flags: { agentId: "agent-test", workspaceId: "ws_test" },
    settings: { output: "text" },
    client: { requestJson },
  } as unknown as Parameters<typeof get.run>[0]);
  expect(writes.join("")).toContain("qwen3-vl-rerank");
  expect(writes.join("")).toContain("hybrid_rerank");
  expect(writes.join("")).toContain('"rerank_top_n":5');
});
