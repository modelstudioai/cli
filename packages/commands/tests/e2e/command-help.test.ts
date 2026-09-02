import { expect, test } from "vite-plus/test";
import { captureCommandHelp, runCommandHelp } from "./helpers.ts";
import { QUOTA_ROUTES } from "./topic-routes.ts";

test("captureCommandHelp 用 topic 最小路由渲染真实命令帮助", async () => {
  const helpOutput = await captureCommandHelp(QUOTA_ROUTES, ["quota", "list"]);

  expect(helpOutput).toContain("Usage: bl quota list");
  expect(helpOutput).toContain("--model <model>");
  expect(helpOutput).toContain("--name <name>");
  expect(helpOutput).toContain("--output <format>");
});

test("runCommandHelp 保持 commands E2E 的 stderr 与 exitCode 断言接口", async () => {
  const result = await runCommandHelp(QUOTA_ROUTES, ["quota", "list", "--help"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Usage: bl quota list");
});
