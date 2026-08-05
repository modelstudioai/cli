/**
 * Syncs frontmatter `metadata.version` for every `skills/<member>/SKILL.md` from
 * `packages/cli/package.json` (single source of truth for CLI release version).
 *
 * Run: pnpm --filter bailian-cli run sync:skill-version
 * Invoked via `pnpm run sync:skill-assets` or the repo pre-commit hook (see `.vite-hooks/pre-commit`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_LINE_RE = /^(\s*version:\s*")[^"]*("\s*)$/m;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dirname, "../packages/cli/package.json");
const SKILLS_DIR = join(__dirname, "../skills");

const { version } = JSON.parse(readFileSync(PKG_PATH, "utf-8")) as { version: string };

const skillPaths = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(SKILLS_DIR, entry.name, "SKILL.md"))
  .filter((skillPath) => existsSync(skillPath));

if (skillPaths.length === 0) {
  throw new Error("skills/: no <member>/SKILL.md found");
}

for (const skillPath of skillPaths) {
  const relPath = skillPath.slice(join(__dirname, "..").length + 1);
  const body = readFileSync(skillPath, "utf-8");

  const lines = body.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error(`${relPath}: must start with --- YAML frontmatter`);
  }
  const closeIdx = lines.findIndex((line, i) => i > 0 && line === "---");
  if (closeIdx === -1) {
    throw new Error(`${relPath}: missing closing --- frontmatter delimiter`);
  }

  const frontmatterLines = lines.slice(0, closeIdx + 1);
  const restLines = lines.slice(closeIdx + 1);
  const frontmatter = frontmatterLines.join("\n");

  if (!VERSION_LINE_RE.test(frontmatter)) {
    throw new Error(
      `${relPath}: could not find metadata.version (expected a line like \`  version: "…"\` in frontmatter)`,
    );
  }

  const updatedFrontmatter = frontmatter.replace(
    VERSION_LINE_RE,
    (_m, g1: string, g2: string) => `${g1}${version}${g2}`,
  );

  const newBody = updatedFrontmatter + "\n" + restLines.join("\n");
  if (newBody !== body) {
    writeFileSync(skillPath, newBody, "utf-8");
    console.log(`Synced ${relPath} metadata.version → ${version}`);
  } else {
    console.log(`${relPath} metadata.version already ${version}`);
  }
}
