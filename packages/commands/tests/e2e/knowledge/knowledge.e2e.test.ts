import { describe, expect, test } from "vite-plus/test";
import {
  isDashScopeE2EReady,
  isKbAdminE2EReady,
  parseStdoutJson,
  runCommandE2e,
} from "../helpers.ts";
import { KNOWLEDGE_ROUTES } from "../topic-routes.ts";

// ---- Types ----

interface DryRunBody {
  endpoint?: string;
  request?: {
    index_id?: string;
    query?: string;
    search_filters?: unknown[];
    rerank_top_n?: number;
    enable_reranking?: boolean;
    dense_similarity_top_k?: number;
    sparse_similarity_top_k?: number;
    rerank?: Array<{ model_name?: string; rerank_mode?: string; rerank_instruct?: string }>;
  };
}

// ---- Help & missing args (no credentials needed) ----

describe("e2e: knowledge retrieve", () => {
  test("knowledge retrieve --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_ROUTES, [
      "knowledge",
      "retrieve",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--query/i);
    expect(stderr).toMatch(/--rerank-top-n/i);
    expect(stderr).toMatch(/deprecated/i);
  });

  test("缺少 --index-id 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_ROUTES, [
      "knowledge",
      "retrieve",
      "--query",
      "test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--index-id|Usage:/i);
  });

  test("缺少 --query 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_ROUTES, [
      "knowledge",
      "retrieve",
      "--index-id",
      "idx_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--query|Usage:/i);
  });
});

// ---- Error scenarios (gated: requires no real credentials, but env may leak) ----

describe.skipIf(!isDashScopeE2EReady())("e2e: knowledge retrieve errors", () => {
  test("无任何凭证时提示缺少密钥并非零退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_ROUTES,
      ["knowledge", "retrieve", "--index-id", "idx_test", "--query", "test", "--output", "json"],
      {
        DASHSCOPE_API_KEY: "",
        DASHSCOPE_ACCESS_TOKEN: "",
        BAILIAN_CONFIG_DIR: "/tmp",
      },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no api key found|no credentials found/i);
  });
});

// ---- Dry-run (no real credentials needed) ----

describe("e2e: knowledge retrieve dry-run", () => {
  test("--dry-run 输出 endpoint 和 snake_case body", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_ROUTES,
      [
        "knowledge",
        "retrieve",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--query",
        "hello",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/rag\/index\/retrieve/);
    expect(data.request?.index_id).toBe("idx_test");
    expect(data.request?.query).toBe("hello");
  });

  test("--dry-run + --top-k 转发到 rerank_top_n 并输出废弃警告", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_ROUTES,
      [
        "knowledge",
        "retrieve",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--query",
        "hello",
        "--top-k",
        "5",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--top-k.*deprecated/i);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.rerank_top_n).toBe(5);
  });

  test("--dry-run + --rerank-top-n 优先于 --top-k", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_ROUTES,
      [
        "knowledge",
        "retrieve",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--query",
        "hello",
        "--top-k",
        "5",
        "--rerank-top-n",
        "10",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.rerank_top_n).toBe(10);
  });

  test("--dry-run + rerank 参数完整输出", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_ROUTES,
      [
        "knowledge",
        "retrieve",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--query",
        "hello",
        "--rerank",
        "--rerank-model",
        "qwen3-rerank-hybrid",
        "--rerank-mode",
        "custom",
        "--rerank-instruct",
        "按相关性排序",
        "--dense-similarity-top-k",
        "100",
        "--sparse-similarity-top-k",
        "50",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.enable_reranking).toBe(true);
    expect(data.request?.dense_similarity_top_k).toBe(100);
    expect(data.request?.sparse_similarity_top_k).toBe(50);
    expect(data.request?.rerank?.[0]?.model_name).toBe("qwen3-rerank-hybrid");
    expect(data.request?.rerank?.[0]?.rerank_mode).toBe("custom");
    expect(data.request?.rerank?.[0]?.rerank_instruct).toBe("按相关性排序");
  });
});

// Live: --rerank-instruct and --top-k (deprecated) on a real index
describe.skipIf(!isKbAdminE2EReady())("e2e: knowledge retrieve 参数补全 (live)", () => {
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("retrieve --rerank-instruct + --top-k (不报错验证)", async () => {
    // Grab a real index id from the workspace
    const listRun = await runCommandE2e(KNOWLEDGE_ROUTES, [
      "knowledge",
      "list",
      "--workspace-id",
      workspaceId,
      "--quiet",
    ]);
    expect(listRun.exitCode, listRun.stderr).toBe(0);
    const indexId = listRun.stdout.trim().split("\n")[0];
    if (!indexId) return;

    // P6: --rerank-instruct (live)
    const rerankInstructRun = await runCommandE2e(KNOWLEDGE_ROUTES, [
      "knowledge",
      "retrieve",
      "--index-id",
      indexId,
      "--query",
      "e2e test",
      "--rerank",
      "--rerank-model",
      "qwen3-rerank-hybrid",
      "--rerank-mode",
      "custom",
      "--rerank-instruct",
      "按相关性排序",
      "--output",
      "json",
    ]);
    expect(rerankInstructRun.exitCode, rerankInstructRun.stderr).toBe(0);

    // P6: --top-k (deprecated, verify still accepted)
    const topKRun = await runCommandE2e(KNOWLEDGE_ROUTES, [
      "knowledge",
      "retrieve",
      "--index-id",
      indexId,
      "--query",
      "e2e test",
      "--top-k",
      "10",
      "--output",
      "json",
    ]);
    expect(topKRun.exitCode, topKRun.stderr).toBe(0);
  }, 60_000);
});
