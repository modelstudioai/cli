import { tmpdir } from "os";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCli } from "./helpers.ts";

interface ContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

interface DryRunBody {
  endpoint?: string;
  request?: {
    input?: {
      messages?: Array<{ role: string; content: string | ContentPart[] }>;
    };
    parameters?: {
      agent_options?: {
        agent_id?: string;
      };
    };
    stream?: boolean;
  };
}

describe("e2e: knowledge chat", () => {
  test("knowledge chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["knowledge", "chat", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--message/i);
    expect(stderr).toMatch(/--agent-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺少 --message 时打印帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli(
      ["knowledge", "chat", "--agent-id", "aid_test", "--non-interactive"],
      { DASHSCOPE_API_KEY: "sk-fake", BAILIAN_CONFIG_DIR: tmpdir() },
    );
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--message|Usage:/i);
  });

  test("缺少 --agent-id 时打印帮助并退出 (0)", async () => {
    const { stderr, exitCode } = await runCli(
      ["knowledge", "chat", "--message", "Hello", "--non-interactive"],
      { DASHSCOPE_API_KEY: "sk-fake", BAILIAN_CONFIG_DIR: tmpdir() },
    );
    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/--agent-id|Usage:/i);
  });

  test("缺少 --workspace-id 时非零退出并提示", async () => {
    const { stderr, exitCode } = await runCli(
      [
        "knowledge",
        "chat",
        "--message",
        "Hello",
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
        "chat",
        "--dry-run",
        "--message",
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
    expect(data.endpoint).toMatch(/api\/v2\/apps\/knowledge\/chat/);
    expect(data.request?.input?.messages?.[0]?.role).toBe("user");
    expect(data.request?.input?.messages?.[0]?.content).toBe("什么是RAG");
    expect(data.request?.parameters?.agent_options?.agent_id).toBe("aid_test");
  });

  test("--dry-run 多轮消息解析 role:content 前缀", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "knowledge",
        "chat",
        "--dry-run",
        "--message",
        "user:什么是RAG",
        "--message",
        "assistant:RAG是检索增强生成",
        "--message",
        "它怎么工作",
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
    const msgs = data.request?.input?.messages ?? [];
    expect(msgs).toHaveLength(3);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[0]?.content).toBe("什么是RAG");
    expect(msgs[1]?.role).toBe("assistant");
    expect(msgs[1]?.content).toBe("RAG是检索增强生成");
    expect(msgs[2]?.role).toBe("user");
    expect(msgs[2]?.content).toBe("它怎么工作");
  });

  test("--dry-run + --image 输出多模态 content 数组", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "knowledge",
        "chat",
        "--dry-run",
        "--message",
        "描述这张图",
        "--agent-id",
        "aid_test",
        "--workspace-id",
        "ws_test",
        "--image",
        "https://example.com/img.jpg",
        "--non-interactive",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const lastMsg = data.request?.input?.messages?.[0];
    expect(lastMsg?.role).toBe("user");
    expect(Array.isArray(lastMsg?.content)).toBe(true);
    const parts = lastMsg?.content as ContentPart[];
    expect(parts[0]).toEqual({ type: "text", text: "描述这张图" });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/img.jpg" },
    });
  });

  test("--dry-run + --image 无 --message 自动创建空 user message", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "knowledge",
        "chat",
        "--dry-run",
        "--agent-id",
        "aid_test",
        "--workspace-id",
        "ws_test",
        "--image",
        "https://example.com/a.png",
        "--image",
        "https://example.com/b.png",
        "--non-interactive",
        "--output",
        "json",
      ],
      { DASHSCOPE_API_KEY: "sk-fake-for-dryrun" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const lastMsg = data.request?.input?.messages?.[0];
    expect(lastMsg?.role).toBe("user");
    const parts = lastMsg?.content as ContentPart[];
    expect(parts[0]).toEqual({ type: "text", text: "" });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/a.png" },
    });
    expect(parts[2]).toEqual({
      type: "image_url",
      image_url: { url: "https://example.com/b.png" },
    });
  });
});
