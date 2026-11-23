import { expect, test } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import { CommandRegistry } from "../src/registry.ts";

// 同名守卫:命令自有 flag 不得与全局或其可见凭证域 flag 同名。

const noopRun = async () => {};

test("命令重声明全局 flag → registry 构造抛错", () => {
  const cmd = defineCommand({
    description: "test",
    auth: "none",
    flags: { output: { type: "string", valueHint: "<f>", description: "dup" } },
    run: noopRun,
  });
  expect(() => new CommandRegistry({ "x y": cmd }, "bl")).toThrow(/redeclares reserved flag/);
});

test("命令重声明其可见域的凭证 flag → 抛错;不可见域的同名 → 放行", () => {
  const consoleCmd = defineCommand({
    description: "test",
    auth: "console",
    flags: { consoleRegion: { type: "string", valueHint: "<r>", description: "dup" } },
    run: noopRun,
  });
  expect(() => new CommandRegistry({ "x y": consoleCmd }, "bl")).toThrow(/consoleRegion/);

  const modelCmd = defineCommand({
    description: "test",
    auth: "apiKey",
    flags: { consoleRegion: { type: "string", valueHint: "<r>", description: "own" } },
    run: noopRun,
  });
  expect(() => new CommandRegistry({ "x y": modelCmd }, "bl")).not.toThrow();
});

test("high risk 命令不能自行声明 runtime 保留的 yes", () => {
  const high = defineCommand({
    description: "test",
    auth: "none",
    risk: { level: "high", message: "dangerous operation" },
    flags: { yes: { type: "switch", description: "duplicate" } },
    run: noopRun,
  });
  const normal = defineCommand({
    description: "test",
    auth: "none",
    flags: { yes: { type: "switch", description: "command-owned" } },
    run: noopRun,
  });

  expect(() => new CommandRegistry({ "x high": high }, "bl")).toThrow(/yes/);
  expect(() => new CommandRegistry({ "x normal": normal }, "bl")).not.toThrow();
});

test("命令 help 只为 high risk 展示风险信息和 runtime 注入的 --yes", () => {
  const high = defineCommand({
    description: "danger",
    auth: "none",
    risk: { level: "high", message: "dangerous operation" },
    exampleArgs: ["--dry-run", "--yes"],
    run: noopRun,
  });
  const normal = defineCommand({
    description: "safe",
    auth: "none",
    run: noopRun,
  });
  const registry = new CommandRegistry({ "asset delete": high, "asset list": normal }, "bl");

  let highHelp = "";
  let normalHelp = "";
  registry.printHelp(["asset", "delete"], {
    write: (chunk: string) => (highHelp += chunk),
  } as unknown as NodeJS.WriteStream);
  registry.printHelp(["asset", "list"], {
    write: (chunk: string) => (normalHelp += chunk),
  } as unknown as NodeJS.WriteStream);

  expect(highHelp).toContain("--yes");
  expect(highHelp).toContain("Risk: high");
  expect(highHelp).toContain("Risk message: dangerous operation");
  expect(highHelp).toMatch(/# Only after explicit confirmation:\n\s+bl asset delete --yes/);
  expect(normalHelp).not.toContain("--yes");
  expect(normalHelp).not.toContain("Risk:");
  expect(normalHelp).not.toContain("Risk message:");
});

test("hybrid leaf help appends Subcommands for nested commands", () => {
  const parent = defineCommand({
    description: { "en-US": "Parent chat", "zh-CN": "父级对话" },
    auth: "apiKey",
    usageArgs: "--message <text>",
    run: noopRun,
  });
  const child = defineCommand({
    description: { "en-US": "Child translate", "zh-CN": "子级翻译" },
    auth: "apiKey",
    usageArgs: "--file <path>",
    run: noopRun,
  });
  const registry = new CommandRegistry(
    {
      omni: parent,
      "omni translate": child,
    },
    "bl",
  );

  let hybridHelp = "";
  registry.printHelp(["omni"], {
    write: (chunk: string) => (hybridHelp += chunk),
  } as unknown as NodeJS.WriteStream);

  expect(hybridHelp).toContain("Parent chat");
  expect(hybridHelp).toContain("--message");
  expect(hybridHelp).toContain("Subcommands:");
  expect(hybridHelp).toMatch(/omni translate/);
  expect(hybridHelp).toContain("Child translate");

  let leafHelp = "";
  registry.printHelp(["omni", "translate"], {
    write: (chunk: string) => (leafHelp += chunk),
  } as unknown as NodeJS.WriteStream);
  expect(leafHelp).toContain("Child translate");
  expect(leafHelp).not.toContain("Subcommands:");
});
