/**
 * Syncs frontmatter `metadata.version` for official `bailian-*` skills under
 * `skills/<member>/SKILL.md` from `packages/cli/package.json`.
 *
 * Partner / best-practice skills (non-bailian- prefix) keep their own version
 * and are not rewritten by this tool.
 *
 * Run: pnpm --filter bailian-cli run sync:skill-version
 * Invoked via `pnpm run sync:skill-assets` or the repo pre-commit hook (see `.vite-hooks/pre-commit`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERSION_LINE_RE = /^(\s*version:\s*")[^"]*("\s*)$/m;

export function isOfficialBailianSkillDir(dirName: string): boolean {
  return dirName.startsWith("bailian-");
}

/** List SKILL.md paths under skillsDir that belong to official bailian-* skills. */
export function listOfficialSkillMarkdownPaths(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isOfficialBailianSkillDir(entry.name))
    .map((entry) => join(skillsDir, entry.name, "SKILL.md"))
    .filter((skillPath) => existsSync(skillPath));
}

export function syncSkillMarkdownVersion(
  skillPath: string,
  version: string,
  relPath = skillPath,
): { changed: boolean; message: string } {
  const body = readFileSync(skillPath, "utf-8");

  const lines = body.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error(`${relPath}: must start with --- YAML frontmatter`);
  }
  const closeIdx = lines.findIndex((line, index) => index > 0 && line === "---");
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
    (_match, prefix: string, suffix: string) => `${prefix}${version}${suffix}`,
  );

  const newBody = updatedFrontmatter + "\n" + restLines.join("\n");
  if (newBody !== body) {
    writeFileSync(skillPath, newBody, "utf-8");
    return { changed: true, message: `Synced ${relPath} metadata.version → ${version}` };
  }
  return { changed: false, message: `${relPath} metadata.version already ${version}` };
}

export function syncOfficialSkillVersions(options: {
  skillsDir: string;
  version: string;
  repoRoot?: string;
}): { synced: number; messages: string[] } {
  const skillPaths = listOfficialSkillMarkdownPaths(options.skillsDir);
  if (skillPaths.length === 0) {
    throw new Error("skills/: no bailian-*/SKILL.md found");
  }

  const messages: string[] = [];
  let synced = 0;
  for (const skillPath of skillPaths) {
    const relPath = options.repoRoot ? skillPath.slice(options.repoRoot.length + 1) : skillPath;
    const result = syncSkillMarkdownVersion(skillPath, options.version, relPath);
    messages.push(result.message);
    if (result.changed) synced += 1;
  }
  return { synced, messages };
}

function main(): void {
  const toolsDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(toolsDir, "..");
  const pkgPath = join(repoRoot, "packages/cli/package.json");
  const skillsDir = join(repoRoot, "skills");
  const { version } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

  const { messages } = syncOfficialSkillVersions({ skillsDir, version, repoRoot });
  for (const message of messages) {
    console.log(message);
  }
}

const invokedAsCli =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsCli) {
  main();
}
