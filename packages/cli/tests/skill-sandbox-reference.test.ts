import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSkillDir } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { parse } from "yaml";
import { commands } from "../src/commands.ts";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const sandboxSkillDirectory = join(repositoryRoot, "skills/bailian-sandbox");

test("Sandbox is a valid standalone skill aligned with the CLI version", () => {
  const metadata = validateSkillDir(sandboxSkillDirectory, "bailian-sandbox");
  expect(metadata.name).toBe("bailian-sandbox");

  const skillMarkdown = readFileSync(join(sandboxSkillDirectory, "SKILL.md"), "utf8");
  const frontmatter = parse(skillMarkdown.split(/^---\s*$/m)[1]) as {
    metadata: { version: string };
  };
  const cliPackage = JSON.parse(
    readFileSync(join(repositoryRoot, "packages/cli/package.json"), "utf8"),
  ) as { version: string };
  expect(frontmatter.metadata.version).toBe(cliPackage.version);

  for (const link of skillMarkdown.matchAll(/\]\(([^)]+)\)/g)) {
    expect(existsSync(join(sandboxSkillDirectory, link[1]))).toBe(true);
  }
});

test("Sandbox reference contains every registered Sandbox command only in its owning skill", () => {
  const expectedCommands = Object.keys(commands)
    .filter((commandPath) => commandPath.startsWith("sandbox "))
    .map((commandPath) => `bl ${commandPath}`)
    .sort();
  expect(expectedCommands.length).toBeGreaterThan(0);

  const reference = readFileSync(join(sandboxSkillDirectory, "reference/sandbox.md"), "utf8");
  const documentedCommands = [...reference.matchAll(/^### `([^`]+)`/gm)]
    .map((match) => match[1])
    .sort();
  expect(documentedCommands).toEqual(expectedCommands);

  const index = readFileSync(join(sandboxSkillDirectory, "reference/index.md"), "utf8");
  for (const commandPath of expectedCommands) {
    expect(index).toContain(`\`${commandPath}\``);
  }
  expect(existsSync(join(repositoryRoot, "skills/bailian-cli/reference/sandbox.md"))).toBe(false);
  const hubIndex = readFileSync(
    join(repositoryRoot, "skills/bailian-cli/reference/index.md"),
    "utf8",
  );
  expect(hubIndex).not.toContain("`bl sandbox ");
});
