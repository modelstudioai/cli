import { API_KEY_PAGE } from "../urls.ts";

const QUICK_START_TASKS = [
  "Help me generate a set of Amazon e-commerce main images for baseball caps (white background + lifestyle shots + model wear shots)",
  "Help me generate a 3-minute humorous crosstalk audio clip",
  "Help me generate a Little Red Riding Hood picture-book PDF (with illustrations)",
  "Help me analyze this video and write a Xiaohongshu-style post",
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
  process.stderr.write("  2. Login:             bl auth login --api-key <your-key>\n\n");
}

export function printQuickStart(): void {
  const { dim, reset } = colors();
  process.stderr.write("\n🎯 Try these with your AI coding assistant:\n\n");
  QUICK_START_TASKS.forEach((task, i) => {
    process.stderr.write(`${dim}${i + 1}${reset}  ${task}\n`);
  });
  process.stderr.write("\n");
}
