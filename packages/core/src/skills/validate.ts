import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

/**
 * Skill validity check (aligned with vercel-labs/skills parseSkillMd semantics):
 *   1. SKILL.md exists as a regular file at the directory root
 *   2. frontmatter is valid YAML delimited by `---`
 *   3. name / description fields exist and are non-empty strings
 *
 * Validation happens in the temp dir before writing to canonical — any failure rolls back the entire install.
 */
export interface SkillMeta {
  name: string;
  description: string;
}

function fail(skillName: string, reason: string): never {
  throw new BailianError(
    `Skill ${skillName} validation failed: ${reason}`,
    ExitCode.GENERAL,
    "This skill package does not conform to the SKILL.md spec; contact the skill publisher to fix and republish",
  );
}

function extractFrontmatter(content: string): string | null {
  if (!content.startsWith("---")) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  return match ? match[1] : null;
}

export function validateSkillDir(dir: string, skillName: string): SkillMeta {
  const skillMdPath = join(dir, "SKILL.md");
  let raw: string;
  try {
    if (!statSync(skillMdPath).isFile()) fail(skillName, "SKILL.md is not a regular file");
    raw = readFileSync(skillMdPath, "utf-8");
  } catch (err) {
    if (err instanceof BailianError) throw err;
    fail(skillName, "missing SKILL.md");
  }

  const frontmatter = extractFrontmatter(raw);
  if (frontmatter === null)
    fail(skillName, "SKILL.md is missing frontmatter (--- delimited YAML header)");

  let data: unknown;
  try {
    data = parse(frontmatter);
  } catch {
    fail(skillName, "frontmatter is not valid YAML");
  }
  if (typeof data !== "object" || data === null) {
    fail(skillName, "frontmatter is not a key-value structure");
  }

  const record = data as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!name || !description)
    fail(skillName, "frontmatter is missing non-empty name / description fields");

  return { name, description };
}
