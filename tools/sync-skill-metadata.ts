/**
 * Syncs `skills/bailian-cli/SKILL.md` frontmatter `metadata.version` from
 * `packages/cli/package.json` (single source of truth for CLI release version).
 *
 * Run: pnpm --filter bailian-cli run sync:skill-version
 * Invoked via `pnpm run sync:skill-assets` or the repo pre-commit hook (see `.vite-hooks/pre-commit`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_LINE_RE = /^(\s*version:\s*")[^"]*("\s*)$/m;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dirname, "../packages/cli/package.json");
const SKILL_PATH = join(__dirname, "../skills/bailian-cli/SKILL.md");

const { version } = JSON.parse(readFileSync(PKG_PATH, "utf-8")) as { version: string };
const body = readFileSync(SKILL_PATH, "utf-8");

const lines = body.split(/\r?\n/);
if (lines[0] !== "---") {
  throw new Error("skills/bailian-cli/SKILL.md: must start with --- YAML frontmatter");
}
const closeIdx = lines.findIndex((line, i) => i > 0 && line === "---");
if (closeIdx === -1) {
  throw new Error("skills/bailian-cli/SKILL.md: missing closing --- frontmatter delimiter");
}

const frontmatterLines = lines.slice(0, closeIdx + 1);
const restLines = lines.slice(closeIdx + 1);
const frontmatter = frontmatterLines.join("\n");

if (!VERSION_LINE_RE.test(frontmatter)) {
  throw new Error(
    'skills/bailian-cli/SKILL.md: could not find metadata.version (expected a line like `  version: "…"` in frontmatter)',
  );
}

const updatedFrontmatter = frontmatter.replace(
  VERSION_LINE_RE,
  (_m, g1: string, g2: string) => `${g1}${version}${g2}`,
);

const newBody = updatedFrontmatter + "\n" + restLines.join("\n");
if (newBody !== body) {
  writeFileSync(SKILL_PATH, newBody, "utf-8");
  console.log(`Synced skills/bailian-cli/SKILL.md metadata.version → ${version}`);
} else {
  console.log(`skills/bailian-cli/SKILL.md metadata.version already ${version}`);
}
