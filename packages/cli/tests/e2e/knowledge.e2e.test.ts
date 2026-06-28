import { tmpdir } from "os";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./helpers.ts";

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
  test("knowledge 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["knowledge"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/knowledge|retrieve/i);
  });

  test("knowledge retrieve --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["knowledge", "retrieve", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--index-id/i);
    expect(stderr).toMatch(/--query/i);
    expect(stderr).toMatch(/--rerank-top-n/i);
    expect(stderr).toMatch(/deprecated/i);
  });

  test("缺少 --index-id 时打印帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli([
      "knowledge",
      "retrieve",
      "--query",
      "test",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--index-id|Usage:/i);
  });

  test("缺少 --query 时打印帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli([
      "knowledge",
      "retrieve",
      "--index-id",
      "idx_test",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--query|Usage:/i);
  });
});

// ---- Error scenarios (no real credentials needed) ----

describe("e2e: knowledge retrieve errors", () => {
  test("无任何凭证时提示缺少密钥并非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      [
        "knowledge",
        "retrieve",
        "--index-id",
        "idx_test",
        "--query",
        "test",
        "--non-interactive",
        "--output",
        "json",
      ],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
        BAILIAN_CONFIG_DIR: tmpdir(),
      },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no api key found|no credentials found/i);
  });
});

// ---- Dry-run (no real credentials needed) ----

describe("e2e: knowledge retrieve dry-run", () => {
  test("--dry-run 输出 endpoint 和 snake_case body", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "knowledge",
        "retrieve",
        "--dry-run",
        "--index-id",
        "idx_test",
        "--query",
        "hello",
        "--non-interactive",
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
    const { stdout, stderr, exitCode } = await runCli(
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
        "--non-interactive",
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
    const { stdout, stderr, exitCode } = await runCli(
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
        "--non-interactive",
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
    const { stdout, stderr, exitCode } = await runCli(
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
        "--non-interactive",
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
