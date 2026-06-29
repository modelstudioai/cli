import { tmpdir } from "os";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./helpers.ts";

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
    const { stderr, exitCode } = await runCli(["knowledge", "search", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--query/i);
    expect(stderr).toMatch(/--agent-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).toMatch(/--image/i);
    expect(stderr).toMatch(/--query-history/i);
  });

  test("缺少 --query 时打印帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli([
      "knowledge",
      "search",
      "--agent-id",
      "aid_test",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--query|Usage:/i);
  });

  test("缺少 --agent-id 时打印帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli([
      "knowledge",
      "search",
      "--query",
      "test",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--agent-id|Usage:/i);
  });

  test("缺少 --workspace-id 时非零退出并提示", async () => {
    const { stderr, exitCode } = await runCli(
      [
        "knowledge",
        "search",
        "--query",
        "test",
        "--agent-id",
        "aid_test",
        "--non-interactive",
        "--output",
        "json",
      ],
      {
        DASHSCOPE_API_KEY: "sk-fake",
        BAILIAN_WORKSPACE_ID: undefined,
        BAILIAN_CONFIG_DIR: tmpdir(),
      },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/workspace.*required/i);
  });

  test("--dry-run 输出 endpoint 和 request body", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "knowledge",
        "search",
        "--dry-run",
        "--query",
        "什么是RAG",
        "--agent-id",
        "aid_test",
        "--workspace-id",
        "ws_test",
        "--non-interactive",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/ws_test\.cn-beijing\.maas\.aliyuncs\.com/);
    expect(data.endpoint).toMatch(/api\/v1\/indices\/knowledge\/search/);
    expect(data.request?.query).toBe("什么是RAG");
    expect(data.request?.agent_id).toBe("aid_test");
  });

  test("--dry-run + --image 输出 images", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
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
        "--non-interactive",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.images).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ]);
  });

  test("--dry-run + --query-history 输出用户对话历史", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
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
        "--non-interactive",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.query_history).toEqual([
      { role: "user", content: "什么是RAG" },
      { role: "assistant", content: "RAG是检索增强生成" },
    ]);
  });

  test("--dry-run + --query-history 无效 JSON 非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      [
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
        "--non-interactive",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/query-history.*valid JSON/i);
  });
});
