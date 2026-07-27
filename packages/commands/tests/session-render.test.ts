import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import type { CollectedSessionEvents, ProviderSessionEvent } from "@openagentpack/sdk";
import { BailianError, ExitCode } from "bailian-cli-core";
import {
  renderCollectedEvents,
  streamAndRenderEvents,
} from "../src/commands/managed-agent/_engine/session-render.ts";

/**
 * `--output json` 会话信封契约：stdout 恰好一个合法 JSON，且信封头部携带
 * session_id / provider / agent —— session run 的调用方必须能从 stdout 拿到
 * 新建 Session ID 以继续 send/get/events/delete（不靠刮 stderr）。
 */

let stdoutChunks: string[] = [];
let originalStdoutWrite: typeof process.stdout.write;

beforeEach(() => {
  stdoutChunks = [];
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalStdoutWrite;
});

function capturedJson(): Record<string, unknown> {
  // 契约：整个 stdout 拼起来是单个合法 JSON
  return JSON.parse(stdoutChunks.join("")) as Record<string, unknown>;
}

async function* fakeEventStream(): AsyncIterable<ProviderSessionEvent> {
  yield {
    type: "message",
    role: "assistant",
    content: "hi",
  } as ProviderSessionEvent;
  yield { type: "status", status: "completed" } as ProviderSessionEvent;
}

async function* fakeFailedEventStream(): AsyncIterable<ProviderSessionEvent> {
  yield {
    type: "error",
    content: "provider quota exceeded",
  } as ProviderSessionEvent;
  yield { type: "status", status: "failed" } as ProviderSessionEvent;
}

function fakeCollected(): CollectedSessionEvents {
  return {
    terminalStatus: "completed",
    result: {
      events: [
        {
          type: "message",
          role: "assistant",
          content: "hi",
        } as ProviderSessionEvent,
      ],
      has_more: false,
      next_page: undefined,
    },
  } as CollectedSessionEvents;
}

function fakeFailedCollected(): CollectedSessionEvents {
  return {
    terminalStatus: "failed",
    result: {
      events: [
        {
          type: "error",
          content: "provider quota exceeded",
        } as ProviderSessionEvent,
      ],
      has_more: false,
      next_page: undefined,
    },
  } as CollectedSessionEvents;
}

async function catchSessionFailure(run: () => Promise<void> | void): Promise<BailianError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(BailianError);
    return error as BailianError;
  }
  throw new Error("expected failed session to throw");
}

test("stream json:信封携带 session_id/provider/agent + events", async () => {
  await streamAndRenderEvents(fakeEventStream(), true, {
    session_id: "sess_stream",
    provider: "bailian",
    agent: "assistant",
  });
  const data = capturedJson();
  expect(data.session_id).toBe("sess_stream");
  expect(data.provider).toBe("bailian");
  expect(data.agent).toBe("assistant");
  expect(Array.isArray(data.events)).toBe(true);
  expect((data.events as unknown[]).length).toBe(2);
});

test("streaming failed:保留 JSON 信封并以服务端 error 消息抛 GENERAL", async () => {
  const error = await catchSessionFailure(() =>
    streamAndRenderEvents(fakeFailedEventStream(), true, {
      session_id: "sess_failed_stream",
      provider: "bailian",
      agent: "assistant",
    }),
  );
  expect(error.exitCode).toBe(ExitCode.GENERAL);
  expect(error.message).toBe("provider quota exceeded");

  const data = capturedJson();
  expect(data.session_id).toBe("sess_failed_stream");
  expect((data.events as unknown[]).length).toBe(2);
});

test("polling json:信封携带 session_id/provider/agent，并保留 has_more/next_page", () => {
  renderCollectedEvents(fakeCollected(), true, {
    session_id: "sess_poll",
    provider: "claude",
    agent: "assistant",
  });
  const data = capturedJson();
  expect(data.session_id).toBe("sess_poll");
  expect(data.provider).toBe("claude");
  expect(data.agent).toBe("assistant");
  expect(data.has_more).toBe(false);
  expect(Array.isArray(data.events)).toBe(true);
});

test("polling failed:保留 JSON 信封并以服务端 error 消息抛 GENERAL", async () => {
  const error = await catchSessionFailure(() =>
    renderCollectedEvents(fakeFailedCollected(), true, {
      session_id: "sess_failed_poll",
      provider: "claude",
      agent: "assistant",
    }),
  );
  expect(error.exitCode).toBe(ExitCode.GENERAL);
  expect(error.message).toBe("provider quota exceeded");

  const data = capturedJson();
  expect(data.session_id).toBe("sess_failed_poll");
  expect((data.events as unknown[]).length).toBe(1);
});

test("json:不传 context 时信封形状不变(无 session_id 键)", () => {
  renderCollectedEvents(fakeCollected(), true);
  const data = capturedJson();
  expect("session_id" in data).toBe(false);
  expect(Array.isArray(data.events)).toBe(true);
});

test("text 模式:context 不影响 stdout(仍只输出助手文本)", async () => {
  await streamAndRenderEvents(fakeEventStream(), false, {
    session_id: "sess_text",
  });
  const output = stdoutChunks.join("");
  expect(output).toBe("hi");
  expect(output).not.toContain("sess_text");
});
