import { expect, test } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import { createTranslator } from "../src/i18n.ts";
import { CommandRegistry } from "../src/registry.ts";

test("translator resolves colocated text while preserving plain strings", () => {
  const translator = createTranslator("zh-CN");

  expect(translator.language).toBe("zh-CN");
  expect(translator.localize("Already localized")).toBe("Already localized");
  expect(
    translator.localize({
      "en-US": "Show help",
      "zh-CN": "显示帮助信息",
    }),
  ).toBe("显示帮助信息");

  expect(
    createTranslator("en-US").localize({
      "en-US": "Show help",
      "zh-CN": "显示帮助信息",
    }),
  ).toBe("Show help");
});

test("registry renders runtime help copy with the selected language", async () => {
  const translator = createTranslator("zh-CN");
  const command = defineCommand({
    description: {
      "en-US": "Test command",
      "zh-CN": "测试命令",
    },
    notes: [
      {
        "en-US": "Test note",
        "zh-CN": "测试说明",
      },
    ],
    auth: "none",
    run: async () => {},
  });
  const registry = new CommandRegistry({ test: command }, "bl", translator);
  let output = "";
  const stream = {
    isTTY: false,
    write(chunk: string) {
      output += chunk;
      return true;
    },
  } as NodeJS.WriteStream;

  registry.printHelp([], stream);

  expect(output).toContain("用法： bl <resource> <command> [flags]");
  expect(output).toContain("测试命令");
  expect(output).toContain("全局选项：");
  expect(output).toContain("显示帮助信息");
  expect(output).toContain("获取帮助：");

  output = "";
  registry.printHelp(["test"], stream);
  expect(output).toContain("测试说明");
});
