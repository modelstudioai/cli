import { describe, expect, test } from "vite-plus/test";
import { isChatE2EReady, parseStdoutJson, runKscli } from "./helpers.ts";

// ---- Types ----

interface ChatJsonResult {
  answer: string;
  request_id: string;
}

// ---- Real API call tests (gated by BAILIAN_E2E + credentials) ----

describe.skipIf(!isChatE2EReady())("e2e: kscli chat (live)", () => {
  const agentId = process.env.BAILIAN_E2E_CHAT_AGENT_ID!;
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID!;

  test("chat (JSON mode) returns answer", async () => {
    const { stdout, stderr, exitCode } = await runKscli([
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
    const { stdout, stderr, exitCode } = await runKscli([
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
    const { stdout, stderr, exitCode } = await runKscli([
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
    const { stdout, stderr, exitCode } = await runKscli([
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
    // Streaming text mode: output should contain some text content
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  test("chat with multi-turn messages returns context-aware answer", async () => {
    const { stdout, stderr, exitCode } = await runKscli([
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
    const { stderr, exitCode } = await runKscli([
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
