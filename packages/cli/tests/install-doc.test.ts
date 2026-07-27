import { readFileSync } from "node:fs";
import { join } from "node:path";
import { credentialFlagDefs, GLOBAL_FLAGS, type AnyCommand } from "bailian-cli-core";
import { monorepoRoot } from "e2e/monorepo-root";
import { describe, expect, test } from "vite-plus/test";
import { commands } from "../src/commands.ts";

const repositoryRoot = monorepoRoot();
const installGuide = readFileSync(join(repositoryRoot, "INSTALL.md"), "utf8");
const cliPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "packages/cli/package.json"), "utf8"),
) as {
  engines?: { node?: string };
};

function toFlagName(key: string): string {
  return `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function findDocumentedCommand(snippet: string): {
  commandPath?: string;
  command?: AnyCommand;
} {
  const argumentText = snippet.slice("bl ".length).trim();
  const commandPath = Object.keys(commands)
    .sort((leftPath, rightPath) => rightPath.length - leftPath.length)
    .find((candidatePath) => {
      return argumentText === candidatePath || argumentText.startsWith(`${candidatePath} `);
    });

  return commandPath ? { commandPath, command: commands[commandPath] } : {};
}

function documentedCommandSnippets(): string[] {
  const fencedCommands = installGuide
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("bl "));
  const inlineCommands = Array.from(installGuide.matchAll(/`(bl [^`\n]+)`/g), (match) => match[1]);
  return [...new Set([...fencedCommands, ...inlineCommands])];
}

describe("INSTALL.md", () => {
  test("发布包 Node.js 要求与安装文档一致", () => {
    const nodeEngine = cliPackage.engines?.node;
    expect(nodeEngine).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(installGuide).toContain(`要求 **≥ ${nodeEngine?.slice(2)}**`);
  });

  test("示例只使用当前命令支持的 flags", () => {
    for (const snippet of documentedCommandSnippets()) {
      const { commandPath, command } = findDocumentedCommand(snippet);
      const argumentText = snippet.slice("bl ".length).trim();

      if (!commandPath || !command) {
        expect(argumentText, `INSTALL.md 中存在未知命令：${snippet}`).toMatch(/^--/);
      }

      const supportedFlags = {
        ...GLOBAL_FLAGS,
        ...(command ? credentialFlagDefs(command) : {}),
        ...command?.flags,
      };
      const supportedFlagNames = new Set(Object.keys(supportedFlags).map(toFlagName));
      const usedFlagNames = Array.from(snippet.matchAll(/--[a-z0-9-]+/g), (match) => match[0]);
      const unsupportedFlagNames = usedFlagNames.filter(
        (flagName) => !supportedFlagNames.has(flagName),
      );

      expect(unsupportedFlagNames, `INSTALL.md 命令使用了未声明的 flag：${snippet}`).toEqual([]);
    }
  });
});
