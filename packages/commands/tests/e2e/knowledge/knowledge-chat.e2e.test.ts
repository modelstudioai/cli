import { describe, expect, test } from "vite-plus/test";
import {
  isChatE2EReady,
  isMultimodalChatE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
} from "../helpers.ts";
import { KNOWLEDGE_CHAT_ROUTES } from "../topic-routes.ts";

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
        agent_version?: string;
      };
    };
    stream?: boolean;
  };
}

describe("e2e: knowledge chat", () => {
  test("knowledge chat --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandHelp(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--message/i);
    expect(stderr).toMatch(/--agent-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺少 --message 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--agent-id",
      "aid_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--message|Usage:/i);
  });

  test("缺少 --agent-id 时报用法错误并退出 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
      "Hello",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--agent-id|Usage:/i);
  });

  test("缺少 --workspace-id 时非零退出并提示", async () => {
    const { stderr, exitCode } = await runCommandE2e(
      KNOWLEDGE_CHAT_ROUTES,
      // Fake key + isolated config dir: keep the local config's workspace_id/api_key from leaking in
      [
        "knowledge",
        "chat",
        "--message",
        "Hello",
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
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--dry-run",
      "--message",
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
    expect(data.endpoint).toMatch(/api\/v2\/apps\/knowledge\/chat/);
    expect(data.request?.input?.messages?.[0]?.role).toBe("user");
    expect(data.request?.input?.messages?.[0]?.content).toBe("什么是RAG");
    expect(data.request?.parameters?.agent_options?.agent_id).toBe("aid_test");
    // Without --agent-version the field is not sent (default behavior unchanged)
    expect(data.request?.parameters?.agent_options).not.toHaveProperty("agent_version");
  });

  test("--dry-run + --agent-version 落在 agent_options 内", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--dry-run",
      "--message",
      "什么是RAG",
      "--agent-id",
      "aid_test",
      "--agent-version",
      "2",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.request?.parameters?.agent_options?.agent_version).toBe("2");
  });

  test("--dry-run 多轮消息解析 role:content 前缀", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
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
      "--output",
      "json",
    ]);
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
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
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
      "--output",
      "json",
    ]);
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
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
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
      "--output",
      "json",
    ]);
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

  test("--dry-run JSON 对象消息通道解析结构化 content", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--dry-run",
      "--message",
      '{"role":"user","content":[{"type":"text","text":"结构化消息"}]}',
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    const firstMsg = data.request?.input?.messages?.[0];
    expect(firstMsg?.role).toBe("user");
    expect(Array.isArray(firstMsg?.content)).toBe(true);
    const parts = firstMsg?.content as ContentPart[];
    expect(parts[0]).toEqual({ type: "text", text: "结构化消息" });
  });

  test("--image 与消息内嵌 image_url 冲突报 USAGE (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--dry-run",
      "--message",
      '{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://example.com/e.png"}}]}',
      "--image",
      "https://example.com/x.png",
      "--agent-id",
      "aid_test",
      "--workspace-id",
      "ws_test",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/embedded/i);
  });
});

interface ChatJsonResult {
  answer: string;
  request_id: string;
}

describe.skipIf(!isChatE2EReady())("e2e: knowledge chat (live)", () => {
  const agentId = process.env.BAILIAN_E2E_CHAT_AGENT_ID!;
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("chat (JSON mode) returns answer", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
      "什么是大模型？",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ChatJsonResult>(stdout);
    expect(data.answer).toBeTruthy();
    expect(data.answer.length).toBeGreaterThan(0);
    expect(data.request_id).toBeTruthy();
  });

  test("chat (text mode) returns plain text", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
      "什么是RAG？",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "text",
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  test("chat (stream, JSON mode) collects and returns answer", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
      "什么是检索增强生成？",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ChatJsonResult>(stdout);
    expect(data.answer).toBeTruthy();
    expect(data.answer.length).toBeGreaterThan(0);
    expect(data.request_id).toBeTruthy();
  });

  test("chat (stream, text mode) outputs streaming text", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
      "什么是向量检索？",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "text",
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  test("chat with multi-turn messages returns context-aware answer", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
      "user:什么是大模型",
      "--message",
      "assistant:大模型是大规模语言模型，具有强大的理解和生成能力",
      "--message",
      "它有哪些应用场景？",
      "--agent-id",
      agentId,
      "--workspace-id",
      workspaceId,
      "--output",
      "json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<ChatJsonResult>(stdout);
    expect(data.answer).toBeTruthy();
    expect(data.answer.length).toBeGreaterThan(0);
  });

  test("chat with invalid agent_id fails gracefully", async () => {
    const { stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
      "knowledge",
      "chat",
      "--message",
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

// Long-lived console-created fixture (multimodal Q&A services cannot be created
// via the CLI — see .env BAILIAN_E2E_IMAGE_CHAT_AGENT_ID)
describe.skipIf(!isMultimodalChatE2EReady())(
  "e2e: knowledge chat --image live (常驻 fixture)",
  () => {
    const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;
    const imageChatAgentId = process.env.BAILIAN_E2E_IMAGE_CHAT_AGENT_ID!;

    test("多模态问答接受 --image 并返回非空回答", async () => {
      const { stdout, stderr, exitCode } = await runCommandE2e(KNOWLEDGE_CHAT_ROUTES, [
        "knowledge",
        "chat",
        "--message",
        "图里有什么",
        "--image",
        "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg",
        "--agent-id",
        imageChatAgentId,
        "--workspace-id",
        workspaceId,
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<ChatJsonResult>(stdout);
      expect(data.answer).toBeTruthy();
      expect(data.answer.length).toBeGreaterThan(0);
    }, 120_000);
  },
);
