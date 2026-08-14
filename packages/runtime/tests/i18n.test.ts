import { expect, test } from "vite-plus/test";
import { defineCommand } from "bailian-cli-core";
import { createTranslator, type CliMessageBundle } from "../src/i18n.ts";
import { CommandRegistry } from "../src/registry.ts";

const messages = {
  namespace: "test",
  resources: {
    "en-US": { greeting: "Hello, {{name}}!", englishOnly: "English fallback" },
    "zh-CN": { greeting: "你好，{{name}}！" },
  },
} satisfies CliMessageBundle;

test("translator uses the selected language, interpolation and English fallback", async () => {
  const translator = await createTranslator("zh-CN", [messages]);

  expect(translator.language).toBe("zh-CN");
  expect(translator.translate("test:greeting", { name: "百炼" })).toBe("你好，百炼！");
  expect(translator.translate("test:englishOnly")).toBe("English fallback");
});

test("translator resolves colocated text while preserving plain strings", async () => {
  const translator = await createTranslator("zh-CN");

  expect(translator.localize("Already localized")).toBe("Already localized");
  expect(
    translator.localize({
      "en-US": "Show help",
      "zh-CN": "显示帮助信息",
    }),
  ).toBe("显示帮助信息");
});

test("registry renders runtime help copy with the selected language", async () => {
  const translator = await createTranslator("zh-CN");
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
