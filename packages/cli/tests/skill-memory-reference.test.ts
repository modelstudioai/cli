import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSkillDir } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { parse } from "yaml";
import { commands } from "../src/commands.ts";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const memorySkillDirectory = join(repositoryRoot, "skills/bailian-memory");

test("Memory is a valid standalone skill aligned with the CLI version", () => {
  const metadata = validateSkillDir(memorySkillDirectory, "bailian-memory");
  expect(metadata.name).toBe("bailian-memory");

  const skillMarkdown = readFileSync(join(memorySkillDirectory, "SKILL.md"), "utf8");
  const frontmatter = parse(skillMarkdown.split(/^---\s*$/m)[1]) as {
    metadata: { version: string };
  };
  const cliPackage = JSON.parse(
    readFileSync(join(repositoryRoot, "packages/cli/package.json"), "utf8"),
  ) as { version: string };
  expect(frontmatter.metadata.version).toBe(cliPackage.version);

  for (const link of skillMarkdown.matchAll(/\]\(([^)]+)\)/g)) {
    expect(existsSync(join(memorySkillDirectory, link[1].split("#")[0]))).toBe(true);
  }
});

test("Memory reference contains every registered Memory command only in its owning skill", () => {
  const expectedCommands = Object.keys(commands)
    .filter((commandPath) => commandPath.startsWith("memory "))
    .map((commandPath) => `bl ${commandPath}`)
    .sort();
  expect(expectedCommands.length).toBeGreaterThan(0);

  const reference = readFileSync(join(memorySkillDirectory, "reference/memory.md"), "utf8");
  const documentedCommands = [...reference.matchAll(/^### `([^`]+)`/gm)]
    .map((match) => match[1])
    .sort();
  expect(documentedCommands).toEqual(expectedCommands);

  const index = readFileSync(join(memorySkillDirectory, "reference/index.md"), "utf8");
  for (const commandPath of expectedCommands) {
    expect(index).toContain(`\`${commandPath}\``);
  }
  expect(existsSync(join(repositoryRoot, "skills/bailian-cli/reference/memory.md"))).toBe(false);
  const hubIndex = readFileSync(
    join(repositoryRoot, "skills/bailian-cli/reference/index.md"),
    "utf8",
  );
  expect(hubIndex).not.toContain("`bl memory ");
});
