import { API_KEY_PAGE } from "../urls.ts";

const QUICK_START_TASKS = [
  "帮我生成一套鸭舌帽的亚马逊电商主图(白底 + 场景图 + 模特上身图)",
  "帮我生成一段 3 分钟的幽默相声音频",
  "帮我生成一套小红帽故事绘本 PDF(含插图)",
  "帮我分析这个视频的内容并写一篇小红书文案",
];

function colors() {
  const isTTY = process.stderr.isTTY;
  return {
    purple: isTTY ? "\x1b[38;2;147;51;234m" : "",
    dim: isTTY ? "\x1b[2m" : "",
    reset: isTTY ? "\x1b[0m" : "",
  };
}

export function printWelcomeBanner(): void {
  const { purple, reset } = colors();
  process.stderr.write(`\n  Welcome to ${purple}Bailian${reset} CLI!\n\n`);
  process.stderr.write("  Get started in 2 steps:\n");
  process.stderr.write(`  1. Get your API Key:  ${API_KEY_PAGE}\n`);
  process.stderr.write("  2. Login:             bl auth login\n\n");
}

export function printQuickStart(): void {
  const { purple, dim, reset } = colors();
  process.stderr.write(
    `\n  ${purple}Quick Start${reset} — try these with your AI coding assistant:\n\n`,
  );
  QUICK_START_TASKS.forEach((task, i) => {
    process.stderr.write(`  ${dim}${i + 1}${reset}  ${task}\n`);
  });
  process.stderr.write("\n");
}
