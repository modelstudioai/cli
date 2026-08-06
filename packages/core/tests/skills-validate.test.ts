import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expect, test } from "vite-plus/test";
import { BailianError } from "../src/errors/base.ts";
import { validateSkillDir } from "../src/skills/validate.ts";

function withSkillDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "bl-skill-validate-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectFail(dir: string, reasonPart: string): void {
  try {
    validateSkillDir(dir, "demo");
    throw new Error("expected validateSkillDir to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(BailianError);
    expect((err as BailianError).message).toContain(reasonPart);
  }
}

test("validate: valid SKILL.md passes and returns frontmatter metadata", () => {
  withSkillDir((dir) => {
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: demo-skill\ndescription: a demo skill\n---\n\n# Demo\n",
    );
    expect(validateSkillDir(dir, "demo")).toEqual({
      name: "demo-skill",
      description: "a demo skill",
    });
  });
});

test("validate: missing SKILL.md → rejected", () => {
  withSkillDir((dir) => expectFail(dir, "missing SKILL.md"));
});

test("validate: SKILL.md is a directory → rejected", () => {
  withSkillDir((dir) => {
    mkdirSync(join(dir, "SKILL.md"));
    expectFail(dir, "SKILL.md is not a regular file");
  });
});

test("validate: missing frontmatter → rejected", () => {
  withSkillDir((dir) => {
    writeFileSync(join(dir, "SKILL.md"), "# no frontmatter\n");
    expectFail(dir, "missing frontmatter");
  });
});

test("validate: frontmatter invalid YAML → rejected", () => {
  withSkillDir((dir) => {
    writeFileSync(join(dir, "SKILL.md"), "---\nname: [unclosed\n---\nbody\n");
    expectFail(dir, "not valid YAML");
  });
});

test("validate: name/description missing or empty → rejected", () => {
  withSkillDir((dir) => {
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\n---\nbody\n");
    expectFail(dir, "name / description");
  });
  withSkillDir((dir) => {
    writeFileSync(join(dir, "SKILL.md"), '---\nname: demo\ndescription: "  "\n---\nbody\n');
    expectFail(dir, "name / description");
  });
  withSkillDir((dir) => {
    writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: 123\n---\nbody\n");
    expectFail(dir, "name / description");
  });
});
