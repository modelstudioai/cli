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
