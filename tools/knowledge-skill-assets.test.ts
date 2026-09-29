import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { expect, test } from "vite-plus/test";
import { validateSkillDir } from "../packages/core/src/skills/validate.ts";
import cliPackage from "../packages/cli/package.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "skills/bailian-knowledge");

test("knowledge skill is installable, version aligned, and all relative document links resolve", () => {
  expect(validateSkillDir(directory, "bailian-knowledge").name).toBe("bailian-knowledge");
  const skill = readFileSync(resolve(directory, "SKILL.md"), "utf8");
  const header = parse(/^---\n([\s\S]*?)\n---/.exec(skill)![1]);
  expect(header.metadata.version).toBe(cliPackage.version);
  expect(header.companions).toBeUndefined();
  const links = [...skill.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  expect(links).toEqual(
    expect.arrayContaining(["../bailian-protocol/SKILL.md", "reference/index.md"]),
  );
  for (const link of links.filter((link) => !link.includes("://"))) {
    expect(existsSync(resolve(directory, link.split("#")[0])), link).toBe(true);
  }
});

test("generated knowledge references and skill metadata are covered by delivery checks", () => {
  const hook = readFileSync(resolve(root, ".vite-hooks/pre-commit"), "utf8");
  const release = readFileSync(resolve(root, "tools/release/check.mjs"), "utf8");
  for (const asset of ["skills/bailian-knowledge/SKILL.md", "skills/bailian-knowledge/reference"]) {
    expect(hook).toContain(asset);
    expect(release).toContain(asset);
  }
  expect(cliPackage.scripts["generate:reference"]).toContain("skills/bailian-knowledge/reference");
});
