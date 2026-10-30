import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { agentLoop } from "./loop.ts";
import type { LLMClient, ToolCall } from "../types.ts";
import { createLLMClient } from "../llm/client.ts";

vi.mock("../skills/loader.ts", () => ({
  loadSkillRegistry: () => [],
  buildSkillRegistryPrompt: () => "",
}));

function call(
  id: string,
  name = "ask_user",
  args: object = { question: "场景？", options: ["写作"], default_if_skip: "写作" },
): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

afterEach(() => vi.unstubAllGlobals());

describe("Agent 轨迹和取消", () => {
  it("记录全部询问请求以及预算拒绝，但最多交互两次", async () => {
    const chatWithTools = vi
      .fn<LLMClient["chatWithTools"]>()
      .mockResolvedValueOnce({ content: "", toolCalls: [call("a"), call("b"), call("c")] })
      .mockResolvedValueOnce({ content: "完成", toolCalls: [] });
    const ask = vi.fn().mockResolvedValue("写作");
    const result = await agentLoop("推荐一个", {
      llm: { chat: vi.fn(), chatJson: vi.fn(), chatWithTools },
      catalog: vi.fn(),
      interaction: { ask },
    });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(result.trajectory.filter((entry) => entry.type === "tool_call")).toHaveLength(3);
    expect(result.trajectory).toContainEqual(
      expect.objectContaining({ type: "tool_result", callId: "c", status: "rejected" }),
    );
    expect(result.trajectory.at(-1)).toMatchObject({ type: "final_answer", reason: "completed" });
    // 系统提示词锁定：本 agent 自身即推荐能力，禁止激活重叠的推荐类 skill
    const systemContent = chatWithTools.mock.calls[0]?.[0]?.[0]?.content;
    expect(systemContent).toContain("this agent IS the model-recommendation capability itself");
    expect(systemContent).toContain("use_skill is ONLY for documentation/data lookup skills");
  });

  it("工具错误不能记录为成功", async () => {
    const chatWithTools = vi
      .fn<LLMClient["chatWithTools"]>()
      .mockResolvedValueOnce({ content: "", toolCalls: [call("a", "use_skill", {})] })
      .mockResolvedValueOnce({ content: "", toolCalls: [] });
    const result = await agentLoop("文档", {
      llm: { chat: vi.fn(), chatJson: vi.fn(), chatWithTools },
      catalog: vi.fn(),
      interaction: { ask: vi.fn() },
    });
    expect(result.trajectory).toContainEqual(
      expect.objectContaining({ type: "tool_result", callId: "a", status: "error" }),
    );
  });

  it("评测超时保留部分轨迹并等待交互清理，未执行工具也记录取消", async () => {
    let cleaned = false;
    const chatWithTools = vi
      .fn<LLMClient["chatWithTools"]>()
      .mockResolvedValue({ content: "", toolCalls: [call("a"), call("b", "use_skill", {})] });
    const catalog = vi.fn();
    const trajectory: Awaited<ReturnType<typeof agentLoop>>["trajectory"] = [];
    const controller = new AbortController();
    const agentPromise = agentLoop(
      "推荐一个",
      {
        llm: { chat: vi.fn(), chatJson: vi.fn(), chatWithTools },
        catalog,
        signal: controller.signal,
        interaction: {
          async ask({ signal }) {
            await new Promise<void>((resolve) =>
              signal?.addEventListener("abort", () => resolve(), { once: true }),
            );
            await new Promise((resolve) => setTimeout(resolve, 5));
            cleaned = true;
            return "写作";
          },
        },
      },
      (event) => trajectory.push(event),
    );
    const outcome = await Promise.race([
      new Promise<"timeout">((resolve) => {
        setTimeout(() => {
          controller.abort();
          resolve("timeout");
        }, 5);
      }),
      agentPromise.then(
        () => "completed" as const,
        () => "rejected" as const,
      ),
    ]);
    expect(outcome).toBe("timeout");
    await expect(agentPromise).rejects.toMatchObject({ kind: "cancelled" });
    expect(cleaned).toBe(true);
    expect(
      trajectory.filter((event) => event.type === "tool_result").map((event) => event.status),
    ).toEqual(["cancelled", "cancelled"]);
    expect(trajectory.at(-1)?.type).toBe("cancelled");
    expect(chatWithTools).toHaveBeenCalledOnce();
    expect(catalog).not.toHaveBeenCalled();
  });

  it("取消中的 HTTP 请求后，不回退引擎或启动下一个工具", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
          controller.abort(new DOMException("评测超时", "TimeoutError"));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const catalog = vi.fn();
    const llm = createLLMClient({ baseUrl: "https://example.invalid", apiKey: "test" });
    await expect(
      agentLoop("推荐一个", {
        llm,
        signal: controller.signal,
        catalog,
        interaction: { ask: vi.fn() },
      }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(catalog).not.toHaveBeenCalled();
  }, 300);
});
