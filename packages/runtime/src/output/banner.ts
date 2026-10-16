import { DEFAULT_LANGUAGE, type Language, type LocalizedText } from "bailian-cli-core";
import type { Translator } from "../i18n.ts";
import { ansi } from "./color.ts";

const WELCOME_TEXT = {
  title: { "en-US": "Welcome to Bailian CLI!", "zh-CN": "欢迎使用 Bailian CLI！" },
  consoleLogin: { "en-US": "Recommended: console login", "zh-CN": "推荐：控制台登录" },
  domestic: { "en-US": "China site:", "zh-CN": "中国站：" },
  international: { "en-US": "International:", "zh-CN": "国际站：" },
  apiKeyLogin: {
    "en-US": "Existing API Key or subscription plan:",
    "zh-CN": "已有 API Key 或订阅计划：",
  },
} satisfies Record<string, LocalizedText>;

function localize(translator: Translator | undefined, text: LocalizedText): string {
  return translator?.localize(text) ?? (typeof text === "string" ? text : text["en-US"]);
}

export function printWelcomeBanner(cliName: string, translator?: Translator): void {
  const color = ansi(process.stderr);
  const title = localize(translator, WELCOME_TEXT.title).replace(
    "Bailian",
    color.purple("Bailian"),
  );
  process.stderr.write(`\n  ${title}\n\n`);
  process.stderr.write(`  ${localize(translator, WELCOME_TEXT.consoleLogin)}\n`);
  process.stderr.write(
    `  ${localize(translator, WELCOME_TEXT.domestic)}       ${cliName} auth login --console\n`,
  );
  process.stderr.write(
    `  ${localize(translator, WELCOME_TEXT.international)} ${cliName} auth login --console --console-site international\n\n`,
  );
  process.stderr.write(`  ${localize(translator, WELCOME_TEXT.apiKeyLogin)}\n`);
  process.stderr.write(`  ${cliName} auth login --api-key <your-key>\n\n`);
}

export function printQuickStart(
  tasks: readonly string[],
  language: Language = DEFAULT_LANGUAGE,
): void {
  const color = ansi(process.stderr);
  const chineseHeading = "试试让你的 AI 编程助手完成这些任务：";
  const englishHeading = "Try these with your AI coding assistant:";
  const englishFirst = language === "en-US";
  const primaryHeading = englishFirst ? englishHeading : chineseHeading;
  const secondaryHeading = englishFirst ? chineseHeading : englishHeading;

  process.stderr.write(`\n🎯 ${color.white(primaryHeading)}\n`);
  process.stderr.write(`   ${color.dim(secondaryHeading)}\n\n`);
  tasks.forEach((task, index) => {
    const [chinese, ...englishLines] = task.split("\n");
    const english = englishLines.join("\n").trimStart();
    const primary = englishFirst ? english : chinese;
    const secondary = englishFirst ? chinese : english;
    process.stderr.write(`${color.dim(String(index + 1))}  ${color.white(primary)}\n`);
    process.stderr.write(`   ${color.dim(secondary)}\n`);
  });
  process.stderr.write("\n");
}
