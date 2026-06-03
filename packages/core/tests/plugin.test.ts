import {
  fileToCommandPath,
  isBailianPluginPackage,
  isPluginPackageName,
} from "../src/types/plugin.ts";
import { expect, test } from "vite-plus/test";

test("isPluginPackageName requires bailian-plugin-* prefix", () => {
  expect(isPluginPackageName("bailian-plugin-agent")).toBe(true);
  expect(isPluginPackageName("@alife/bailian-plugin-agent")).toBe(true);
  expect(isPluginPackageName("bailian-agent")).toBe(false);
  expect(isPluginPackageName("@alife/bailian-agent")).toBe(false);
  expect(isPluginPackageName("bailian-cli")).toBe(false);
  expect(isPluginPackageName("lodash")).toBe(false);
});

test("isBailianPluginPackage requires naming and bailianCli.plugin=true", () => {
  expect(isBailianPluginPackage("bailian-plugin-agent", { plugin: true, commands: "./cmds" })).toBe(
    true,
  );
  expect(isBailianPluginPackage("bailian-agent", { plugin: true, commands: "./cmds" })).toBe(false);
  expect(isBailianPluginPackage("bailian-plugin-agent", { commands: "./cmds" })).toBe(false);
  expect(isBailianPluginPackage("bailian-plugin-agent", undefined)).toBe(false);
  expect(isBailianPluginPackage("bailian-cli", { plugin: true, commands: "./cmds" })).toBe(false);
});

test("fileToCommandPath", () => {
  expect(fileToCommandPath("agent/chat.ts")).toBe("agent chat");
  expect(fileToCommandPath("update.js")).toBe("update");
  expect(fileToCommandPath("text/index.ts")).toBe("text");
});
