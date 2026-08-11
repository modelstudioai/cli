import { API_KEY_PAGE, TOKEN_PLAN_PAGE } from "../urls.ts";
import { ansi } from "./color.ts";

export function printWelcomeBanner(cliName: string): void {
  const color = ansi(process.stderr);
  process.stderr.write(`\n  Welcome to ${color.purple("Bailian")} CLI!\n\n`);
  process.stderr.write("  Get started in 2 steps:\n");
  process.stderr.write(`  1. Get your API Key:  ${API_KEY_PAGE}\n`);
  process.stderr.write(`  2. Login:             ${cliName} auth login --api-key <your-key>\n\n`);
  process.stderr.write("  Token Plan:\n");
  process.stderr.write(`  1. Get your API Key:  ${TOKEN_PLAN_PAGE}\n`);
  process.stderr.write(
    `  2. Login:             ${cliName} auth login --config token-plan --api-key <your-key>\n\n`,
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
