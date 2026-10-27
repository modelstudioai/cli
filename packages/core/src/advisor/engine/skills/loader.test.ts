import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { excludedSkillNames, loadSkillRegistry } from "./loader.ts";

function writeSkill(dir: string, dirName: string, frontmatter: string): void {
  const skillDir = join(dir, dirName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), frontmatter, "utf-8");
}

const FRONTMATTER = (name: string) =>
  `---\nname: ${name}\ndescription: Test skill for registry scanning.\n---\n\n# ${name}\n`;

describe("技能注册表排除机制", () => {
  let dir: string;
  const origSkillsDir = process.env.BAILIAN_SKILLS_DIR;
  const origExclude = process.env.BAILIAN_SKILL_EXCLUDE;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bailian-skills-test-"));
    process.env.BAILIAN_SKILLS_DIR = dir;
    delete process.env.BAILIAN_SKILL_EXCLUDE;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (origSkillsDir === undefined) delete process.env.BAILIAN_SKILLS_DIR;
    else process.env.BAILIAN_SKILLS_DIR = origSkillsDir;
    if (origExclude === undefined) delete process.env.BAILIAN_SKILL_EXCLUDE;
    else process.env.BAILIAN_SKILL_EXCLUDE = origExclude;
  });

  it("内置排除：与 agent 能力重叠的推荐类技能不进入注册表", () => {
    writeSkill(dir, "bailian-model-recommend", FRONTMATTER("bailian-model-recommend"));
    writeSkill(dir, "bailian-docs-llm-wiki", FRONTMATTER("bailian-docs-llm-wiki"));
    const names = loadSkillRegistry().map((skill) => skill.name);
    expect(names).not.toContain("bailian-model-recommend");
    expect(names).toContain("bailian-docs-llm-wiki");
  });

  it("内置排除按 frontmatter name 匹配，目录名无关", () => {
    writeSkill(dir, "custom-dir", FRONTMATTER("bailian-model-recommend"));
    expect(loadSkillRegistry()).toHaveLength(0);
  });

  it("BAILIAN_SKILL_EXCLUDE 扩展排除名单（逗号分隔、去空格）", () => {
    writeSkill(dir, "my-rec", FRONTMATTER("my-rec"));
    writeSkill(dir, "keep-me", FRONTMATTER("keep-me"));
    process.env.BAILIAN_SKILL_EXCLUDE = " my-rec , other-one ";
    const names = loadSkillRegistry().map((skill) => skill.name);
    expect(names).not.toContain("my-rec");
    expect(names).toContain("keep-me");
    expect(excludedSkillNames().has("other-one")).toBe(true);
  });
});
