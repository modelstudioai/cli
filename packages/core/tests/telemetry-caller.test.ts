import { expect, test } from "vite-plus/test";
import { readCaller } from "../src/telemetry/caller.ts";

test.each([
  { label: "missing", env: {} },
  { label: "blank", env: { BAILIAN_CALLER_TYPE: "   " } },
  { label: "explicit human", env: { BAILIAN_CALLER_TYPE: "human" } },
  { label: "illegal false", env: { BAILIAN_CALLER_TYPE: "false" } },
  { label: "illegal ai-agent", env: { BAILIAN_CALLER_TYPE: "ai-agent" } },
  { label: "illegal zero", env: { BAILIAN_CALLER_TYPE: "0" } },
])("maps $label to human without agent fields", ({ env }) => {
  expect(readCaller(env)).toEqual({ callerType: "human" });
});

test.each([
  { label: "agent", type: "agent" },
  { label: "ai_agent", type: "ai_agent" },
  { label: "Agent", type: "Agent" },
  { label: "AI_AGENT", type: "AI_AGENT" },
  { label: "padded agent", type: "  agent  " },
])("accepts $label as agent", ({ type }) => {
  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: type,
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "bailian-cli",
      BAILIAN_SKILL_VERSION: "2.5.0",
    }),
  ).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
    skillVersion: "2.5.0",
  });
});

test("normalizes callerName and falls back to unknown", () => {
  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: " Claude Code ",
    }),
  ).toEqual({ callerType: "agent", callerName: "claude-code" });

  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "qwen_code",
    }),
  ).toEqual({ callerType: "agent", callerName: "qwen-code" });

  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "bad/name!",
    }),
  ).toEqual({ callerType: "agent", callerName: "unknown" });

  expect(readCaller({ BAILIAN_CALLER_TYPE: "agent" })).toEqual({
    callerType: "agent",
    callerName: "unknown",
  });
});

test("drops illegal skillName and only keeps version when skillName is valid", () => {
  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "not-bailian",
      BAILIAN_SKILL_VERSION: "2.5.0",
    }),
  ).toEqual({ callerType: "agent", callerName: "cursor" });

  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "bailian-cli",
      BAILIAN_SKILL_VERSION: "not-a-version",
    }),
  ).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
  });

  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "bailian-cli",
      BAILIAN_SKILL_VERSION: "2.5.0-beta.1",
    }),
  ).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
    skillVersion: "2.5.0-beta.1",
  });
});

test("lowercases skillName before validation", () => {
  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "Bailian-CLI",
      BAILIAN_SKILL_VERSION: "2.5.0",
    }),
  ).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-cli",
    skillVersion: "2.5.0",
  });

  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "agent",
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "BAILIAN-GEN",
      BAILIAN_SKILL_VERSION: "2.5.0",
    }),
  ).toEqual({
    callerType: "agent",
    callerName: "cursor",
    skillName: "bailian-gen",
    skillVersion: "2.5.0",
  });
});

test("ignores agent detail fields when callerType is human", () => {
  expect(
    readCaller({
      BAILIAN_CALLER_TYPE: "human",
      BAILIAN_CALLER_NAME: "cursor",
      BAILIAN_SKILL_NAME: "bailian-cli",
      BAILIAN_SKILL_VERSION: "2.5.0",
    }),
  ).toEqual({ callerType: "human" });
});
