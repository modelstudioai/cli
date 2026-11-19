import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  checkSkillContribution,
  collectTouchedPartnerSkillDirs,
  isSafeSkillName,
} from "./check-skill-contribution.mjs";

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function writePartnerSkill(repoRoot, name, options = {}) {
  const dir = join(repoRoot, "skills", name);
  mkdirSync(dir, { recursive: true });
  const frontmatterName = options.frontmatterName ?? name;
  const description = options.description ?? "Partner skill fixture for contribution checks.";
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${frontmatterName}`,
      "metadata:",
      '  version: "0.1.0"',
      "description: >-",
      `  ${description}`,
      "---",
      "",
      `# ${frontmatterName}`,
      "",
    ].join("\n"),
    "utf-8",
  );
}

function fixtureRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "skill-contribution-"));
  directories.push(repoRoot);
  mkdirSync(join(repoRoot, "skills"), { recursive: true });
  writePartnerSkill(repoRoot, "bailian-cli", {
    frontmatterName: "bailian-cli",
    description: "Official hub fixture.",
  });
  return repoRoot;
}

test("collectTouchedPartnerSkillDirs ignores bailian-* and non-skill paths", () => {
  expect(
    collectTouchedPartnerSkillDirs([
      "skills/bailian-cli/SKILL.md",
      "skills/finance-expert/SKILL.md",
      "packages/core/src/index.ts",
      "docs/skill-contribute/README.md",
    ]),
  ).toEqual(["finance-expert"]);
});

test("isSafeSkillName rejects path-like names", () => {
  expect(isSafeSkillName("finance-expert")).toBe(true);
  expect(isSafeSkillName("../evil")).toBe(false);
  expect(isSafeSkillName("a b")).toBe(false);
});

test("first-party skill-only changes skip the partner gate", () => {
  const repoRoot = fixtureRepo();
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/bailian-cli/SKILL.md"],
  });
  expect(result.enabled).toBe(false);
  expect(result.ok).toBe(true);
});

test("valid partner-only contribution passes", () => {
  const repoRoot = fixtureRepo();
  writePartnerSkill(repoRoot, "finance-expert");
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/finance-expert/SKILL.md", "docs/skill-contribute/README.md"],
    existingSkillDirs: ["bailian-cli"],
    newPartnerSkillDirs: ["finance-expert"],
  });
  expect(result.enabled).toBe(true);
  expect(result.ok).toBe(true);
  expect(result.partnerDirs).toEqual(["finance-expert"]);
});

test("mixing partner skill with packages/ fails path isolation", () => {
  const repoRoot = fixtureRepo();
  writePartnerSkill(repoRoot, "finance-expert");
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/finance-expert/SKILL.md", "packages/core/src/index.ts"],
    existingSkillDirs: ["bailian-cli"],
    newPartnerSkillDirs: ["finance-expert"],
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toMatch(/packages\/core/);
});

test("touching bailian-* alongside a partner skill is not CI-hard", () => {
  const repoRoot = fixtureRepo();
  writePartnerSkill(repoRoot, "finance-expert");
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/finance-expert/SKILL.md", "skills/bailian-cli/SKILL.md"],
    existingSkillDirs: ["bailian-cli"],
    newPartnerSkillDirs: ["finance-expert"],
  });
  expect(result.enabled).toBe(true);
  expect(result.ok).toBe(true);
});

test("new partner skill colliding with an existing skills/ dir fails", () => {
  const repoRoot = fixtureRepo();
  writePartnerSkill(repoRoot, "finance-expert");
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/finance-expert/SKILL.md"],
    existingSkillDirs: ["bailian-cli", "finance-expert"],
    newPartnerSkillDirs: ["finance-expert"],
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toMatch(/already exists/);
});

test("frontmatter name must match directory name", () => {
  const repoRoot = fixtureRepo();
  writePartnerSkill(repoRoot, "finance-expert", { frontmatterName: "other-name" });
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/finance-expert/SKILL.md"],
    existingSkillDirs: ["bailian-cli"],
    newPartnerSkillDirs: ["finance-expert"],
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toMatch(/must match the directory name/);
});

test("editing skills/*/reference/** fails", () => {
  const repoRoot = fixtureRepo();
  writePartnerSkill(repoRoot, "finance-expert");
  mkdirSync(join(repoRoot, "skills/finance-expert/reference"), { recursive: true });
  writeFileSync(join(repoRoot, "skills/finance-expert/reference/x.md"), "# no\n");
  const result = checkSkillContribution({
    repoRoot,
    changedFiles: ["skills/finance-expert/SKILL.md", "skills/finance-expert/reference/x.md"],
    existingSkillDirs: ["bailian-cli"],
    newPartnerSkillDirs: ["finance-expert"],
  });
  expect(result.ok).toBe(false);
  expect(result.errors.join("\n")).toMatch(/reference/);
});
