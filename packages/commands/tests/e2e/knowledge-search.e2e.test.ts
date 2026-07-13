import { describe, expect, test } from "vite-plus/test";
import { isSearchE2EReady, parseStdoutJson, runCommandE2e } from "./helpers.ts";
import { KNOWLEDGE_SEARCH_ROUTES } from "./topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  request?: {
    query?: string;
    agent_id?: string;
    images?: string[];
    query_history?: Array<{ role: string; content: string }>;
  };
}

describe("e2e: knowledge search", () => {
  test("knowledge search --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--query/i);
    expect(stderr).toMatch(/--agent-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).toMatch(/--image/i);
    expect(stderr).toMatch(/--query-history/i);
  });

  test("缺少 --query 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--agent-id",
      "aid_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--query|Usage:/i);
  });

  test("缺少 --agent-id 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--query",
      "test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--agent-id|Usage:/i);
  });

  test("缺少 --workspace-id 时非零退出并提示", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_SEARCH_ROUTES,
      // 假 key + 隔离配置目录:避免本机 config 的 workspace_id/api_key 漏入
      [
        "knowledge",
        "search",
        "--query",
        "test",
        "--agent-id",
        "aid_test",
        "--api-key",
        "sk-fake",
        "--output",
        "json",
      ],
      { BAILIAN_WORKSPACE_ID: "", BAILIAN_CONFIG_DIR: "/tmp" },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/workspace.*required/i);
  });

  test("--dry-run 输出 endpoint 和 request body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--dry-run",
      "--query",
      "什么是RAG",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/ws_test\.cn-beijing\.maas\.aliyuncs\.com/);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/knowledge\/search/);
    expect(data.request?.query).toBe("什么是RAG");
    expect(data.request?.agent_id).toBe("aid_test");
  });

  test("--dry-run + --image 输出 images", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--dry-run",
      "--query",
      "test",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--image",
      "https://example.com/a.jpg",
      "--image",
      "https://example.com/b.jpg",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.images).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ]);
  });

  test("--dry-run + --query-history 输出用户对话历史", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--dry-run",
      "--query",
      "它怎么工作",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--query-history",
      '[{"role":"user","content":"什么是RAG"},{"role":"assistant","content":"RAG是检索增强生成"}]',
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.query_history).toEqual([
      { role: "user", content: "什么是RAG" },
      { role: "assistant", content: "RAG是检索增强生成" },
    ]);
  });

  test("--dry-run + --query-history 无效 JSON 非零退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--dry-run",
      "--query",
      "test",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--query-history",
      "not-valid-json",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/query-history.*valid JSON/i);
  });
});

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
      metadata: Record<string, unknown>;
    }>;
  };
}

describe.skipIf(!isSearchE2EReady())("e2e: knowledge search (live)", () => {
  const agentId = process.env.BAILIAN_E2E_SEARCH_AGENT_ID!;
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("search returns results in JSON mode", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--query",
      "什么是大模型",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
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
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--query",
      "RAG",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "text",
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toMatch(/\[1\].*score/);
  });

  test("search with --query-history returns results", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--query",
      "它怎么工作",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--query-history",
      '[{"role":"user","content":"什么是大模型"},{"role":"assistant","content":"大模型是大规模语言模型"}]',
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<SearchResponse>(stdout);
    expect(data.code).toBe("Success");
    expect(data.data.nodes.length).toBeGreaterThan(0);
  });

  test("search with invalid agent_id fails gracefully", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--query",
      "test",
      "--agent-id",
      "aid-invalid-not-exist",
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toBeTruthy();
  });
});
