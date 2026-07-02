import { describe, expect, test } from "vite-plus/test";
import { isSearchE2EReady, parseStdoutJson, runKscli } from "./helpers.ts";

// ---- Types ----

interface SearchResponse {
  code: string;
  status_code: number;
  request_id: string;
  data: {
    total: number;
    cost_time: number;
    nodes: Array<{
      score: number;
      text: string;
      metadata: {
        content?: string;
        title?: string;
        doc_id?: string;
        doc_name?: string;
        doc_url?: string;
        pipeline_id?: string;
        workspace_id?: string;
        page_number?: number;
        image_url?: string;
        _knowledge_type?: string;
        _citation_index?: number;
        _score?: number;
      };
    }>;
  };
}

// ---- Real API call tests (gated by BAILIAN_E2E + credentials) ----

describe.skipIf(!isSearchE2EReady())("e2e: kscli search (live)", () => {
  const agentId = process.env.BAILIAN_E2E_SEARCH_AGENT_ID!;
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("search returns results in JSON mode", async () => {
    const { stdout, stderr, exitCode } = await runKscli([
      "search",
      "--query",
      "什么是大模型",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--non-interactive",
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SearchResponse>(stdout);
    expect(data.code).toBe("Success");
    expect(data.request_id).toBeTruthy();
    expect(data.data.total).toBeGreaterThan(0);
    expect(data.data.nodes.length).toBeGreaterThan(0);

    const firstNode = data.data.nodes[0]!;
    expect(typeof firstNode.score).toBe("number");
    expect(firstNode.score).toBeGreaterThanOrEqual(0);
    expect(typeof firstNode.text).toBe("string");
    expect(firstNode.text.length).toBeGreaterThan(0);
  });

  test("search returns results in text mode", async () => {
    const { stdout, stderr, exitCode } = await runKscli([
      "search",
      "--query",
      "RAG",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--non-interactive",
      "--output",
      "text",
    ]);

    expect(exitCode, stderr).toBe(0);
    // Text mode: [1] (score: 0.xxxx) followed by text content
    expect(stdout).toMatch(/\[1\].*score/);
  });

  test("search with --query-history returns results", async () => {
    const { stdout, stderr, exitCode } = await runKscli([
      "search",
      "--query",
      "它怎么工作",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--query-history",
      '[{"role":"user","content":"什么是大模型"},{"role":"assistant","content":"大模型是大规模语言模型"}]',
      "--non-interactive",
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SearchResponse>(stdout);
    expect(data.code).toBe("Success");
    expect(data.data.nodes.length).toBeGreaterThan(0);
  });

  test("search with invalid agent_id fails gracefully", async () => {
    const { stderr, exitCode } = await runKscli([
      "search",
      "--query",
      "test",
      "--agent-id",
      "aid-invalid-not-exist",
      "--workspace-id",
      workspaceId,
      "--non-interactive",
      "--output",
      "json",
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toBeTruthy();
  });
});
