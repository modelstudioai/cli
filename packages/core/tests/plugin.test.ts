import {
  fileToCommandPath,
  isBailianPluginPackage,
  isPluginPackageName,
} from "../src/types/plugin.ts";
import { expect, test } from "vite-plus/test";

test("isPluginPackageName matches naming convention only", () => {
  expect(isPluginPackageName("bailian-agent")).toBe(true);
  expect(isPluginPackageName("@alife/bailian-agent")).toBe(true);
  expect(isPluginPackageName("lodash")).toBe(false);
  expect(isPluginPackageName("bailian-cli")).toBe(false);
});

test("isBailianPluginPackage requires bailianCli.plugin=true", () => {
  expect(isBailianPluginPackage("bailian-agent", { plugin: true, commands: "./cmds" })).toBe(true);
  expect(isBailianPluginPackage("bailian-agent", { commands: "./cmds" })).toBe(false);
  expect(isBailianPluginPackage("bailian-agent", undefined)).toBe(false);
  expect(isBailianPluginPackage("bailian-cli", { plugin: true, commands: "./cmds" })).toBe(false);
});

test("fileToCommandPath", () => {
  expect(fileToCommandPath("agent/chat.ts")).toBe("agent chat");
  expect(fileToCommandPath("update.js")).toBe("update");
  expect(fileToCommandPath("text/index.ts")).toBe("text");
});
