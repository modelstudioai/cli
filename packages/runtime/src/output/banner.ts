import { API_KEY_PAGE, TOKEN_PLAN_PAGE } from "../urls.ts";
import type { LocalizedText } from "bailian-cli-core";
import type { Translator } from "../i18n.ts";
import { ansi } from "./color.ts";

const WELCOME_TEXT = {
  title: { "en-US": "Welcome to Bailian CLI!", "zh-CN": "欢迎使用 Bailian CLI！" },
  getStarted: { "en-US": "Get started in 2 steps:", "zh-CN": "只需两步即可开始使用：" },
  getApiKey: { "en-US": "Get your API Key:", "zh-CN": "获取 API Key：" },
  login: { "en-US": "Login:", "zh-CN": "登录：" },
  tokenPlan: { "en-US": "Token Plan:", "zh-CN": "Token Plan：" },
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
  process.stderr.write(`  ${localize(translator, WELCOME_TEXT.getStarted)}\n`);
  process.stderr.write(`  1. ${localize(translator, WELCOME_TEXT.getApiKey)}  ${API_KEY_PAGE}\n`);
  process.stderr.write(
    `  2. ${localize(translator, WELCOME_TEXT.login)}             ${cliName} auth login --api-key <your-key>\n\n`,
  );
  process.stderr.write(`  ${localize(translator, WELCOME_TEXT.tokenPlan)}\n`);
  process.stderr.write(
    `  1. ${localize(translator, WELCOME_TEXT.getApiKey)}  ${TOKEN_PLAN_PAGE}\n`,
  );
  process.stderr.write(
    `  2. ${localize(translator, WELCOME_TEXT.login)}             ${cliName} auth login --config token-plan --api-key <your-key>\n\n`,
  );
}

export function printQuickStart(tasks: readonly string[]): void {
  const color = ansi(process.stderr);
  process.stderr.write("\n🎯 试试让你的 AI 编程助手完成这些任务：\n");
  process.stderr.write(`   ${color.dim("Try these with your AI coding assistant:")}\n\n`);
  tasks.forEach((task, index) => {
    const [chinese, ...englishLines] = task.split("\n");
    process.stderr.write(`${color.dim(String(index + 1))}  ${chinese}\n`);
    englishLines.forEach((english) => {
      process.stderr.write(`${color.dim(english)}\n`);
    });
  });
  process.stderr.write("\n");
}
