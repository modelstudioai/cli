import { API_KEY_PAGE } from "../urls.ts";
import { ansi } from "./color.ts";

export function printWelcomeBanner(cliName: string): void {
  const color = ansi(process.stderr);
  process.stderr.write(`\n  Welcome to ${color.purple("Bailian")} CLI!\n\n`);
  process.stderr.write("  Get started in 2 steps:\n");
  process.stderr.write(`  1. Get your API Key:  ${API_KEY_PAGE}\n`);
  process.stderr.write(`  2. Login:             ${cliName} auth login --api-key <your-key>\n\n`);
}

export function printQuickStart(tasks: readonly string[]): void {
  const color = ansi(process.stderr);
  process.stderr.write("\n🎯 Try these with your AI coding assistant:\n\n");
  tasks.forEach((task, i) => {
    process.stderr.write(`${color.dim(String(i + 1))}  ${task}\n`);
  });
  process.stderr.write("\n");
}
