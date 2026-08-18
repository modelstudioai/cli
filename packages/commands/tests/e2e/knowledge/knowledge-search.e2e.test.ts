import { describe, expect, test } from "vite-plus/test";
import {
  isMultimodalSearchE2EReady,
  isSearchE2EReady,
  isTableSearchE2EReady,
  parseStdoutJson,
  runCommandE2e,
} from "../helpers.ts";
import { KNOWLEDGE_SEARCH_ROUTES } from "../topic-routes.ts";

interface DryRunBody {
  endpoint?: string;
  request?: {
    query?: string;
    agent_id?: string;
    agent_version?: string;
    images?: string[];
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
      // Fake key + isolated config dir: keep the local config's workspace_id/api_key from leaking in
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
    // Without --agent-version the field is not sent (default behavior unchanged: latest published version)
    expect(data.request).not.toHaveProperty("agent_version");
  });

  test("--dry-run + --agent-version 落在 body 顶层", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
      "knowledge",
      "search",
      "--dry-run",
      "--query",
      "什么是RAG",
      "--agent-id",
      "aid_test",
      "--agent-version",
      "beta",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.agent_version).toBe("beta");
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

// Long-lived console-created fixtures (multimodal / table services cannot be
// created via the CLI — see .env BAILIAN_E2E_IMAGE_SEARCH_AGENT_ID etc.)
describe.skipIf(!isMultimodalSearchE2EReady())(
  "e2e: knowledge search --image live (常驻 fixture)",
  () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
    const imageSearchAgentId = process.env.BAILIAN_E2E_IMAGE_SEARCH_AGENT_ID!;

    test("多模态服务接受 --image 并返回 Success", async () => {
      // Recall is not asserted: hits depend on the fixture base's image contents.
      // The functional contract under test: the images param is accepted end-to-end.
      const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
        "knowledge",
        "search",
        "--query",
        "图里有什么",
        "--agent-id",
        imageSearchAgentId,
        "--workspace-id",
        workspaceId,
        "--image",
        "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<SearchResponse>(stdout);
      expect(data.code).toBe("Success");
      expect(Array.isArray(data.data.nodes)).toBe(true);
    }, 60_000);
  },
);

describe.skipIf(!isTableSearchE2EReady())(
  "e2e: knowledge search 表格库 live (常驻 fixture)",
  () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
    const tableSearchAgentId = process.env.BAILIAN_E2E_TABLE_SEARCH_AGENT_ID!;

    test("表格行召回: 命中 fixture 已知单元格值", async () => {
      // “颜色填充” is a known ZH-column cell in the fixture table (nop0ludera)
      const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
        "knowledge",
        "search",
        "--query",
        "颜色填充",
        "--agent-id",
        tableSearchAgentId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<SearchResponse>(stdout);
      expect(data.code).toBe("Success");
      expect(data.data.nodes.length).toBeGreaterThan(0);
      expect(data.data.nodes.map((node) => node.text).join("\n")).toContain("颜色填充");
    }, 60_000);

    test("--agent-version 非法版本值: 服务端拒绝并原样透传 (非零退出)", async () => {
      // The version set is server-side state — the CLI sends the value as-is and
      // passes the server rejection through (verified live: RagAgentNotExist)
      const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_SEARCH_ROUTES, [
        "knowledge",
        "search",
        "--query",
        "颜色填充",
        "--agent-id",
        tableSearchAgentId,
        "--agent-version",
        "not-a-version",
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/Agent application not found|RagAgentNotExist/i);
    }, 60_000);
  },
);
