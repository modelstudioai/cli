import { describe, expect, it } from "vite-plus/test";
import { isSubagentSession } from "../src/recall.ts";
import type { Agent } from "@deepseek-ai/dsh-agent";

function agentWithHeader(header: Record<string, unknown>): Agent {
  return {
    session: { header },
  } as unknown as Agent;
}

describe("recall gating", () => {
  it("treats subagent origin as non-top-level", () => {
    expect(isSubagentSession(agentWithHeader({ origin: "subagent" }))).toBe(true);
    expect(isSubagentSession(agentWithHeader({ delegationDepth: 1 }))).toBe(true);
    expect(isSubagentSession(agentWithHeader({ parentSession: "sess-parent" }))).toBe(true);
    expect(isSubagentSession(agentWithHeader({}))).toBe(false);
  });
});

import { vi } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import { installAutomaticRecall } from "../src/recall.ts";
import { emptyPersonalMemoryConfig } from "../src/personal-config.ts";
import type { MemoryClient } from "../src/memory-client.ts";
import type { ResolvedConfig } from "../src/config.ts";

it.each(["timeout", "cancel", "search failure"] as const)(
  "settles a hanging recall on %s and aborts its requests",
  async (mode) => {
    vi.useFakeTimers();
    try {
      let hook: (...args: any[]) => Promise<unknown> = async () => undefined;
      const search = vi.fn(() =>
        mode === "search failure"
          ? Promise.reject(new Error("search unavailable"))
          : new Promise(() => {}),
      );
      const getCurrentProfile = vi.fn(
        (_userId: string, _schemaId: unknown, signal: AbortSignal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
          ),
      );
      const ctx = {
        on: (_event: string, handler: typeof hook) => {
          hook = handler;
        },
        get: () => undefined,
      } as unknown as Context;
      installAutomaticRecall(ctx, {
        client: {
          search,
          getCurrentProfile,
        } as unknown as MemoryClient,
        resolveConfig: () => ({ enabled: true, autoRecall: true }) as ResolvedConfig,
        readConfig: async () => ({
          ...emptyPersonalMemoryConfig(),
          status: "active",
          user_id: "user",
          workspace_id: "ws",
        }),
      });
      const controller = new AbortController();
      const decision = { kind: "enter", messages: [] };
      let settled = false;
      const pending = hook(
        {
          agent: agentWithHeader({}),
          turn: 1,
          step: 0,
          messages: [{ content: [{ type: "text", text: "hello" }] }],
          signal: controller.signal,
        },
        async () => decision,
      ).then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(0);
      if (mode === "cancel") controller.abort();
      await vi.advanceTimersByTimeAsync(mode === "timeout" ? 5000 : 0);
      expect(settled).toBe(true);
      expect(await pending).toBe(decision);
      expect(getCurrentProfile.mock.calls[0]![2].aborted).toBe(true);
      expect((search.mock.calls[0] as unknown as [unknown, AbortSignal])[1].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  },
);
