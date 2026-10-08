import { describe, expect, it } from "vite-plus/test";
import { parseCuratorDecision, validateCuratorDecision } from "../src/curator.ts";

describe("curator decision validation", () => {
  it("parses JSON decision from model text", () => {
    const decision = parseCuratorDecision(
      'Here: {"action":"commit","quotes":["住杭州"],"memoryText":"用户住杭州","includeProfile":true}',
    );
    expect(decision.action).toBe("commit");
    expect(decision.memoryText).toBe("用户住杭州");
  });

  it("requires quotes that appear in sources", () => {
    const validated = validateCuratorDecision(
      {
        action: "commit",
        quotes: ["住杭州"],
        memoryText: "用户住杭州",
      },
      ["我平时住杭州，做产品设计"],
    );
    expect(validated.ok).toBe(true);
  });

  it("rejects commit with credential text", () => {
    const validated = validateCuratorDecision(
      {
        action: "commit",
        quotes: ["key"],
        memoryText: "api_key=sk-abcdefghijklmnopqrstuvwxyz",
      },
      ["my key is here"],
    );
    expect(validated.ok).toBe(false);
  });
});
