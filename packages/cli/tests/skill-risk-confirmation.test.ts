import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const skillsRoot = join(repositoryRoot, "skills");
const scopedCreateCommands = new Set([
  "bl managed-agent agent create",
  "bl managed-agent deployment create",
  "bl managed-agent environment create",
  "bl managed-agent skill create",
  "bl managed-agent vault create",
  "bl managed-agent vault credential create",
]);

test("generated references distinguish runtime high-risk confirmation from scoped create execution", () => {
  let highRiskCommandCount = 0;
  const seenScopedCreateCommands = new Set<string>();

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
        const commandName = commandSection.match(/^### `([^`]+)`/m)?.[1];
        const hasConfirmationFlag = commandSection.includes("`--yes`");
        const hasHighRiskMetadata = /\|\s+\*\*Risk\*\*\s+\|\s+`high`\s+\|/.test(commandSection);

        if (!hasHighRiskMetadata) {
          if (!hasConfirmationFlag) continue;
          expect(commandName).toBeDefined();
          expect(scopedCreateCommands.has(commandName ?? "")).toBe(true);
          expect(commandSection).toMatch(/Without --yes, .*preview/i);
          seenScopedCreateCommands.add(commandName ?? "");
          continue;
        }

        highRiskCommandCount += 1;
        expect(hasConfirmationFlag).toBe(true);
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
  expect([...seenScopedCreateCommands].sort()).toEqual([...scopedCreateCommands].sort());
});
