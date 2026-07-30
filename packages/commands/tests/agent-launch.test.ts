import { expect, test } from "vite-plus/test";
import {
  AGENT_COMMANDS,
  agentCommand,
  agentLaunchable,
  launchAgent,
} from "../src/commands/config/agent-launch.ts";

test("agentCommand 返回已知 agent 的可执行命令,未知返回 undefined", () => {
  expect(agentCommand("qwen-code")).toBe("qwen");
  expect(agentCommand("codex")).toBe("codex");
  expect(agentCommand("nope")).toBeUndefined();
  // Guards against prototype keys leaking through the allowlist lookup.
  expect(agentCommand("toString")).toBeUndefined();
});

test("AGENT_COMMANDS 覆盖所有已知 agent id", () => {
  expect(Object.keys(AGENT_COMMANDS).sort()).toEqual(
    ["claude-code", "codex", "hermes", "opencode", "openclaw", "qwen-code"].sort(),
  );
});

test("launchAgent 对未知 id 抛错且不启动任何进程", async () => {
  await expect(launchAgent("definitely-not-an-agent")).rejects.toThrow(/Unknown agent/);
});

test("agentLaunchable 对未知 id 返回 false,不探测 PATH", async () => {
  expect(await agentLaunchable("definitely-not-an-agent")).toBe(false);
  // Prototype keys must not resolve to a launchable command either.
  expect(await agentLaunchable("toString")).toBe(false);
});
