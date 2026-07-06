import { API_KEY_PAGE } from "../urls.ts";
import { ansi } from "./color.ts";

const QUICK_START_TASKS = [
  "Help me generate a set of Amazon e-commerce main images for baseball caps (white background + lifestyle shots + model wear shots)",
  "Help me generate a 3-minute humorous crosstalk audio clip",
  "Help me generate a Little Red Riding Hood picture-book PDF (with illustrations)",
  "Help me analyze this video and write a Xiaohongshu-style post",
];

export function printWelcomeBanner(cliName: string): void {
  const color = ansi(process.stderr);
  process.stderr.write(`\n  Welcome to ${color.purple("Bailian")} CLI!\n\n`);
  process.stderr.write("  Get started in 2 steps:\n");
  process.stderr.write(`  1. Get your API Key:  ${API_KEY_PAGE}\n`);
  process.stderr.write(`  2. Login:             ${cliName} auth login --api-key <your-key>\n\n`);
}

export function printQuickStart(): void {
  const color = ansi(process.stderr);
  process.stderr.write("\n🎯 Try these with your AI coding assistant:\n\n");
  QUICK_START_TASKS.forEach((task, i) => {
    process.stderr.write(`${color.dim(String(i + 1))}  ${task}\n`);
  });
  process.stderr.write("\n");
}
