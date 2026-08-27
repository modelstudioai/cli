import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentDecl, StateManager } from "@openagentpack/sdk";
import { expect, test } from "vite-plus/test";
import {
  normalizeAgentKey,
  replaceConfigAtomically,
  selectAgentKey,
} from "../src/commands/managed-agent/agent/create.ts";
import {
  normalizeResourceKey,
  parseMetadata,
} from "../src/commands/managed-agent/_engine/scoped-create.ts";

function candidate(instructions = "help") {
  return buildAgentDecl(undefined, {
    name: "Assistant",
    model: "qwen3.8-max",
    instructions,
    provider: "bailian",
  }).agent;
}

test("Agent key 从显示名生成并保留 Unicode", () => {
  expect(normalizeAgentKey("  Data Assistant  ")).toBe("data-assistant");
  expect(normalizeAgentKey("数据分析 助手")).toBe("数据分析-助手");
  expect(normalizeAgentKey("***")).toBe("agent");
});

test("通用资源 key 与 metadata 输入保持稳定", () => {
  expect(normalizeResourceKey("  Production Vault  ", "vault")).toBe("production-vault");
  expect(normalizeResourceKey("生产 环境", "environment")).toBe("生产-环境");
  expect(normalizeResourceKey("***", "vault")).toBe("vault");
  expect(parseMetadata(["owner=platform", "empty="])).toEqual({
    owner: "platform",
    empty: "",
  });
  expect(() => parseMetadata(["missing-separator"])).toThrow(/Invalid metadata/);
});

test("同名已跟踪 Agent 分配递增 key", () => {
  const state = StateManager.initialize("/tmp/bailian-cli-agent-create-state.json");
  state.setResource({
    address: { type: "agent", name: "assistant", provider: "bailian" },
    remote_id: "agent_existing",
    content_hash: "hash",
  });

  expect(
    selectAgentKey({
      displayName: "Assistant",
      provider: "bailian",
      agents: {
        assistant: candidate(),
        "assistant-2": { ...candidate(), instructions: "other" },
      },
      candidate: candidate(),
      state,
    }),
  ).toEqual({ key: "assistant-3", reusedPending: false });
});

test("远端失败后复用完全相同的待创建声明", () => {
  const state = StateManager.initialize("/tmp/bailian-cli-agent-create-pending-state.json");

  expect(
    selectAgentKey({
      displayName: "Assistant",
      provider: "bailian",
      agents: { assistant: candidate() },
      candidate: candidate(),
      state,
    }),
  ).toEqual({ key: "assistant", reusedPending: true });
});

test("同名待创建声明配置不同则创建新的逻辑 key", () => {
  const state = StateManager.initialize("/tmp/bailian-cli-agent-create-different-state.json");

  expect(
    selectAgentKey({
      displayName: "Assistant",
      provider: "bailian",
      agents: { assistant: candidate("old") },
      candidate: candidate("new"),
      state,
    }),
  ).toEqual({ key: "assistant-2", reusedPending: false });
});

test("YAML 替换校验原内容并保留文件权限", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bailian-agent-create-"));
  const configPath = join(directory, "agents.yaml");
  try {
    await writeFile(configPath, "version: old\n", "utf8");
    await chmod(configPath, 0o640);
    await replaceConfigAtomically(configPath, "version: old\n", "version: new\n");
    expect(await readFile(configPath, "utf8")).toBe("version: new\n");
    expect((await stat(configPath)).mode & 0o777).toBe(0o640);

    await expect(
      replaceConfigAtomically(configPath, "version: stale\n", "version: overwritten\n"),
    ).rejects.toThrow(/changed while resource create was being prepared/);
    expect(await readFile(configPath, "utf8")).toBe("version: new\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
