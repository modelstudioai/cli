/**
 * skills/loader.ts — Skill discovery & registry (Level 1: metadata only).
 *
 * Scans ~/.bailian/skills/<name>/SKILL.md, parses the YAML frontmatter
 * (name + description) with a minimal parser — no yaml dependency, keeping
 * the engine free of heavy imports.
 *
 * The registry is injected into the agent system prompt so the model knows
 * which skills exist and when to use them. Full SKILL.md bodies are only
 * loaded on demand via the use_skill tool (Level 2).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../../config/paths.ts";

export interface SkillMeta {
  /** Skill identifier (directory name or frontmatter name). */
  name: string;
  /** What the skill does and when to use it — the trigger signal for the model. */
  description: string;
  /** Absolute path to the skill directory (basePath for relative file access). */
  basePath: string;
}

/** Max total characters for all skill descriptions in the registry prompt. */
const DESCRIPTION_BUDGET = 8000;

/**
 * Skills whose capability overlaps with the agent itself (model
 * recommendation/selection). They are never injected into the prompt and
 * cannot be loaded via use_skill, so the agent always routes such requests
 * to its native recommend tool instead of recursing into a skill.
 */
const BUILT_IN_EXCLUDED = new Set(["bailian-model-recommend"]);

/**
 * Effective exclusion set: built-in overlaps plus user-supplied names from
 * BAILIAN_SKILL_EXCLUDE (comma-separated). Matched against both the skill
 * directory name and the frontmatter `name`.
 */
export function excludedSkillNames(): Set<string> {
  const extra = (process.env.BAILIAN_SKILL_EXCLUDE ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return new Set([...BUILT_IN_EXCLUDED, ...extra]);
}

export function getSkillsDir(): string {
  return process.env.BAILIAN_SKILLS_DIR || join(getConfigDir(), "skills");
}

/**
 * Minimal YAML frontmatter parser: extracts top-level `key: value` pairs
 * from the `---` delimited block at the top of a SKILL.md.
 * Handles multi-line folded scalars (`>-` / `|`) by joining continuation lines.
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const result: Record<string, string> = {};
  let currentKey = "";
  let collecting = false;

  for (const line of lines) {
    // Continuation of a multi-line scalar (indented line while collecting)
    if (collecting && /^\s+/.test(line)) {
      result[currentKey] += (result[currentKey] ? " " : "") + line.trim();
      continue;
    }
    collecting = false;
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    if (rawValue === ">-" || rawValue === "|" || rawValue === ">" || rawValue === "|-") {
      // Multi-line scalar: start collecting
      currentKey = key;
      result[key] = "";
      collecting = true;
    } else {
      result[key] = rawValue.trim();
    }
  }
  return result;
}

/**
 * Scan the skills directory and return metadata for all valid skills.
 * A valid skill is a directory containing a SKILL.md with at least a
 * `name` (or falls back to the directory name) and `description`.
 */
export function loadSkillRegistry(): SkillMeta[] {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) return [];

  const skills: SkillMeta[] = [];
  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return [];
  }

  const excluded = excludedSkillNames();

  for (const entry of entries) {
    const skillDir = join(skillsDir, entry);
    const skillMdPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    let content: string;
    try {
      content = readFileSync(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    const meta = parseFrontmatter(content);
    const name = meta.name || entry;
    if (excluded.has(entry) || excluded.has(name)) continue; // capability overlap with the agent
    const description = meta.description || "";
    if (!description) continue; // no description = no trigger signal, skip

    skills.push({ name, description, basePath: skillDir });
  }

  return skills;
}

/**
 * Build the skill registry block for injection into the agent system prompt.
 * Respects the description budget: if total exceeds the limit, descriptions
 * are truncated but all skill names are preserved.
 */
export function buildSkillRegistryPrompt(skills: SkillMeta[]): string {
  if (skills.length === 0) return "";

  const lines: string[] = [
    "## Available Skills",
    "When the user's request matches a skill's description, call the `use_skill` tool with that skill's name to load its full instructions.",
    "",
  ];

  let usedChars = 0;
  for (const skill of skills) {
    let desc = skill.description;
    const remaining = DESCRIPTION_BUDGET - usedChars;
    if (remaining <= 0) {
      desc = "(description truncated)";
    } else if (desc.length > remaining) {
      desc = desc.slice(0, remaining) + "…";
    }
    usedChars += desc.length;
    lines.push(`- **${skill.name}**: ${desc}`);
  }

  return lines.join("\n");
}
