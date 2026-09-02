import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const skillsRoot = join(repositoryRoot, "skills");

test("every generated high-risk command reference requires user confirmation before --yes", () => {
  let highRiskCommandCount = 0;

  for (const skillDirectory of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!skillDirectory.isDirectory()) continue;
    const referenceDirectory = join(skillsRoot, skillDirectory.name, "reference");

    let referenceFiles: string[];
    try {
      referenceFiles = readdirSync(referenceDirectory).filter(
        (fileName) => fileName.endsWith(".md") && fileName !== "index.md",
      );
    } catch {
      continue;
    }

    for (const referenceFile of referenceFiles) {
      const markdown = readFileSync(join(referenceDirectory, referenceFile), "utf8");
      const commandSections = markdown.split(/(?=^### `bl )/m).slice(1);

      for (const commandSection of commandSections) {
        if (!commandSection.includes("`--yes`")) continue;
        highRiskCommandCount += 1;
        expect(commandSection).toMatch(/\|\s+\*\*Risk\*\*\s+\|\s+`high`\s+\|/);
        expect(commandSection).toMatch(/\|\s+\*\*Risk message\*\*\s+\|\s+.+\|/);
        expect(commandSection).toMatch(/type=.*requires_confirmation/);
        const agentSafetyLine = commandSection
          .split("\n")
          .find((line) => line.startsWith("> **Agent safety:**"));
        expect(agentSafetyLine).toBeDefined();
        expect(agentSafetyLine).toMatch(/never add `--yes` automatically/i);
        expect(agentSafetyLine).toMatch(/explicit user confirmation/i);
        expect(agentSafetyLine).not.toContain("`--dry-run`");
      }
    }
  }

  expect(highRiskCommandCount).toBeGreaterThan(0);
});
