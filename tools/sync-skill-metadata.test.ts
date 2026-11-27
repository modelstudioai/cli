import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  isOfficialBailianSkillDir,
  listOfficialSkillMarkdownPaths,
  syncOfficialSkillVersions,
} from "./sync-skill-metadata.ts";

function writeSkill(skillsDir: string, name: string, version: string): string {
  const dir = join(skillsDir, name);
  mkdirSync(dir, { recursive: true });
  const skillPath = join(dir, "SKILL.md");
  writeFileSync(
    skillPath,
    [
      "---",
      `name: ${name}`,
      "metadata:",
      `  version: "${version}"`,
      "description: fixture skill for sync isolation",
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n"),
    "utf-8",
  );
  return skillPath;
}

test("isOfficialBailianSkillDir only accepts bailian- prefix", () => {
  expect(isOfficialBailianSkillDir("bailian-cli")).toBe(true);
  expect(isOfficialBailianSkillDir("bailian-protocol")).toBe(true);
  expect(isOfficialBailianSkillDir("finance-expert")).toBe(false);
  expect(isOfficialBailianSkillDir("spark-video")).toBe(false);
});

test("syncOfficialSkillVersions updates bailian-* only and leaves partner skills unchanged", () => {
  const skillsDir = mkdtempSync(join(tmpdir(), "sync-skill-metadata-"));
  const officialPath = writeSkill(skillsDir, "bailian-demo", "0.0.1");
  const partnerPath = writeSkill(skillsDir, "finance-expert", "0.1.0");

  expect(listOfficialSkillMarkdownPaths(skillsDir)).toEqual([officialPath]);

  const result = syncOfficialSkillVersions({
    skillsDir,
    version: "9.9.9",
    repoRoot: skillsDir,
  });
  expect(result.synced).toBe(1);

  expect(readFileSync(officialPath, "utf-8")).toContain('version: "9.9.9"');
  expect(readFileSync(partnerPath, "utf-8")).toContain('version: "0.1.0"');
});

test("syncOfficialSkillVersions fails when no bailian-* skill markdown exists", () => {
  const skillsDir = mkdtempSync(join(tmpdir(), "sync-skill-metadata-empty-"));
  writeSkill(skillsDir, "finance-expert", "0.1.0");
  expect(() => syncOfficialSkillVersions({ skillsDir, version: "1.0.0" })).toThrow(
    /no bailian-\*\/SKILL\.md found/,
  );
});
