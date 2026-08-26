/**
 * Runtime skill registration: the packaged bailian-kb SKILL.md joins the catalog
 * when a skills registry is composed.
 *
 * The file's YAML frontmatter is the single source of truth for the routing name
 * and description — duplicating them here drifts, and the copy that loses is the
 * one nobody reads. The frontmatter must also be STRIPPED from the registered
 * body: `SkillDefinition.content` is contractually the body a provider has
 * already cleaned of its own metadata, and `ctx.skills.register()` parses
 * nothing, so handing over the raw file ships the YAML block into the model's
 * context.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves ctx.skills for the optional inject below.
import type {} from "@deepseek-ai/dsh-skill";

const SKILL_DIR = fileURLToPath(new URL("../skills/bailian-kb/", import.meta.url));

/** The registrable fields carried by one skill file. */
export interface ParsedSkillFile {
  /** Kebab-case skill name from frontmatter. */
  name: string;
  /** Routing description from frontmatter (the catalog truncates at 500 chars). */
  description: string;
  /** Optional extra routing guidance. */
  whenToUse?: string;
  /** Optional frontmatter `metadata` object. */
  metadata?: Record<string, unknown>;
  /** Markdown body with the frontmatter block removed. */
  content: string;
}

/**
 * Locate the frontmatter block, mirroring the filesystem provider's delimiters
 * so a file that loads from disk behaves identically when bundled.
 * @param raw - the file's full text.
 * @returns the frontmatter YAML and the body after it, or undefined when unfenced.
 */
function splitFrontmatter(raw: string): { yaml: string; body: string } | undefined {
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return undefined;
  const start = firstLineEnd + 1;
  let lineStart = start;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
      return {
        yaml: raw.slice(start, lineStart),
        body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1),
      };
    }
    if (nextNewline < 0) return undefined;
    lineStart = nextNewline + 1;
  }
  return undefined;
}

/**
 * Parse one skill file into its registrable fields.
 * @param raw - the file's full text.
 * @returns the parsed fields, or undefined when the frontmatter is absent, unparsable, or missing name/description.
 */
export function parseSkillFile(raw: string): ParsedSkillFile | undefined {
  const split = splitFrontmatter(raw);
  if (split === undefined) return undefined;
  let data: unknown;
  try {
    data = parseYaml(split.yaml);
  } catch (_invalidYaml) {
    return undefined;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  // The registry rejects a blank description outright; failing here keeps the
  // diagnostic on the file instead of on the registration call.
  if (name === "" || description === "") return undefined;
  const whenToUse = typeof record.whenToUse === "string" ? record.whenToUse.trim() : "";
  const metadata =
    typeof record.metadata === "object" &&
    record.metadata !== null &&
    !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : undefined;
  return {
    name,
    description,
    ...(whenToUse !== "" ? { whenToUse } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    content: split.body,
  };
}

/**
 * Register the management skill when the skills registry is composed; headless
 * assemblies without the seam stay unaffected. An unreadable or malformed file
 * degrades to a warning — a broken bundled asset must not fail plugin load.
 * @param ctx - the plugin context.
 */
export function registerSkill(ctx: Context): void {
  ctx.inject(["skills"], (skillCtx) => {
    const path = join(SKILL_DIR, "SKILL.md");
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (unreadable) {
      skillCtx.logger.warn(
        `bailian-kb skill not registered: cannot read ${path}: ${String(unreadable)}`,
      );
      return;
    }
    const parsed = parseSkillFile(raw);
    if (parsed === undefined) {
      skillCtx.logger.warn(
        `bailian-kb skill not registered: ${path} needs YAML frontmatter carrying name and description`,
      );
      return;
    }
    skillCtx.skills.register({
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      content: parsed.content,
      source: "bundled",
      path,
      resourceBase: { kind: "directory", path: SKILL_DIR },
    });
  });
}
