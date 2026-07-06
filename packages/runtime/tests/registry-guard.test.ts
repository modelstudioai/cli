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
