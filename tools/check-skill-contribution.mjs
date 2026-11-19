/**
 * Light contribution gate for partner (non-bailian-) skills under skills/.
 *
 * When the changed file list does not touch any non-bailian- skills/<name>/ path,
 * the check is a no-op (first-party skill / package PRs keep today's behavior).
 *
 * Run: node tools/check-skill-contribution.mjs
 *      node tools/check-skill-contribution.mjs --files skills/foo/SKILL.md,packages/core/x.ts
 *      node tools/check-skill-contribution.mjs --files skills/foo/SKILL.md --new-skills foo --existing-skills foo,bailian-cli
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(TOOLS_DIR, "..");

const DOC_WHITELIST_PREFIXES = ["docs/skill-contribute/"];

const FORBIDDEN_PREFIXES = ["packages/", "tools/", ".vite-hooks/", ".github/workflows/"];

const TOOLS_EXCEPTION_PREFIXES = ["tools/check-skill-contribution."];

/** Align with packages/core/src/skills/sanitize.ts isSafeSkillName */
export function isSafeSkillName(name) {
  if (!name || typeof name !== "string") return false;
  const sanitized = name
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/\.\.+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return sanitized.length > 0 && sanitized === name;
}

export function isOfficialBailianSkillDir(dirName) {
  return dirName.startsWith("bailian-");
}

export function normalizeRepoPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

/** Collect partner skill directory names touched by the changed files. */
export function collectTouchedPartnerSkillDirs(changedFiles) {
  const names = new Set();
  for (const raw of changedFiles) {
    const filePath = normalizeRepoPath(raw);
    const match = /^skills\/([^/]+)\//.exec(filePath);
    if (!match) continue;
    const dirName = match[1];
    if (!isOfficialBailianSkillDir(dirName)) {
      names.add(dirName);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function isWhitelisted(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return DOC_WHITELIST_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isToolsException(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return TOOLS_EXCEPTION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isForbiddenPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  if (isWhitelisted(normalized) || isToolsException(normalized)) return false;
  // skills/bailian-* is a docs soft rule only (official naming / hub edits); not CI-hard.
  return FORBIDDEN_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function extractFrontmatter(content) {
  if (!content.startsWith("---")) return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  return match ? match[1] : null;
}

/** Align with packages/core/src/skills/validate.ts field requirements. */
export function readSkillFrontmatterMeta(skillMdPath) {
  let raw;
  try {
    if (!statSync(skillMdPath).isFile()) {
      return { ok: false, error: "SKILL.md is not a regular file" };
    }
    raw = readFileSync(skillMdPath, "utf-8");
  } catch {
    return { ok: false, error: "missing SKILL.md" };
  }

  const frontmatter = extractFrontmatter(raw);
  if (frontmatter === null) {
    return { ok: false, error: "SKILL.md is missing frontmatter (--- delimited YAML header)" };
  }

  let data;
  try {
    data = parseYaml(frontmatter);
  } catch {
    return { ok: false, error: "frontmatter is not valid YAML" };
  }
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "frontmatter is not a key-value structure" };
  }

  const record = data;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!name || !description) {
    return { ok: false, error: "frontmatter is missing non-empty name / description fields" };
  }
  return { ok: true, name, description };
}

export function listSkillDirs(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @param {object} options
 * @param {string[]} options.changedFiles
 * @param {string} options.repoRoot
 * @param {string[]} [options.existingSkillDirs] skill dirs that already existed (e.g. on merge base)
 * @param {string[]} [options.newPartnerSkillDirs] partner dirs newly introduced in this change set
 */
export function checkSkillContribution(options) {
  const repoRoot = options.repoRoot;
  const changedFiles = options.changedFiles.map(normalizeRepoPath);
  const partnerDirs = collectTouchedPartnerSkillDirs(changedFiles);

  if (partnerDirs.length === 0) {
    return {
      enabled: false,
      ok: true,
      partnerDirs: [],
      errors: [],
      message: "No partner skill paths changed; contribution gate skipped.",
    };
  }

  const errors = [];

  const forbiddenHits = changedFiles.filter((filePath) => isForbiddenPath(filePath));
  if (forbiddenHits.length > 0) {
    errors.push(
      "Partner skill PRs must not change packages/**, tools/**, .vite-hooks/**, " +
        "or .github/workflows/** (docs/skill-contribute/** is allowed). " +
        "Split tooling changes into a separate PR. Forbidden paths:\n  - " +
        forbiddenHits.join("\n  - "),
    );
  }

  const referenceHits = changedFiles.filter((filePath) =>
    /^skills\/[^/]+\/reference\//.test(filePath),
  );
  if (referenceHits.length > 0) {
    errors.push(
      "Do not add or edit skills/*/reference/** (generated command docs). Offending paths:\n  - " +
        referenceHits.join("\n  - "),
    );
  }

  const skillsDir = join(repoRoot, "skills");
  const existingSkillDirs = options.existingSkillDirs ?? listSkillDirs(skillsDir);
  const newPartnerSkillDirs = new Set(options.newPartnerSkillDirs ?? []);

  for (const dirName of partnerDirs) {
    if (!isSafeSkillName(dirName)) {
      errors.push(
        `Unsafe skill directory name "${dirName}" (must be a safe directory name; no spaces, path separators, or "..").`,
      );
    }

    // Creating a "new" skill whose name already existed on the base branch
    if (newPartnerSkillDirs.has(dirName) && existingSkillDirs.includes(dirName)) {
      errors.push(
        `Skill name "${dirName}" already exists under skills/. Choose a different directory name.`,
      );
    }

    const skillMdPath = join(skillsDir, dirName, "SKILL.md");
    const meta = readSkillFrontmatterMeta(skillMdPath);
    if (!meta.ok) {
      errors.push(`skills/${dirName}: ${meta.error}`);
      continue;
    }
    if (meta.name !== dirName) {
      errors.push(
        `skills/${dirName}: frontmatter name "${meta.name}" must match the directory name "${dirName}".`,
      );
    }
  }

  return {
    enabled: true,
    ok: errors.length === 0,
    partnerDirs,
    errors,
    message:
      errors.length === 0
        ? `Partner skill contribution check passed (${partnerDirs.join(", ")}).`
        : `Partner skill contribution check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`,
  };
}

function parseCsvArg(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || !argv[index + 1]) return null;
  return argv[index + 1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  return {
    files: parseCsvArg(argv, "--files"),
    baseRef: (() => {
      const index = argv.indexOf("--base");
      return index !== -1 ? argv[index + 1] : undefined;
    })(),
    repoRoot: (() => {
      const index = argv.indexOf("--repo-root");
      return index !== -1 && argv[index + 1] ? resolve(argv[index + 1]) : DEFAULT_REPO_ROOT;
    })(),
    newSkills: parseCsvArg(argv, "--new-skills"),
    existingSkills: parseCsvArg(argv, "--existing-skills"),
  };
}

function gitLines(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout || result.status}`,
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveMergeBase(repoRoot, baseRef) {
  const against =
    baseRef ||
    process.env.GITHUB_BASE_SHA ||
    process.env.GITHUB_BASE_REF ||
    process.env.CI_MERGE_BASE ||
    process.env.SKILL_CONTRIBUTION_BASE;
  if (!against) return null;
  // Prefer a SHA when CI provides GITHUB_BASE_SHA; otherwise resolve merge-base with the ref name
  if (/^[0-9a-f]{7,40}$/i.test(against)) {
    return against;
  }
  return gitLines(repoRoot, ["merge-base", "HEAD", against])[0];
}

function detectChangedFiles(repoRoot, baseRef) {
  const mergeBase = resolveMergeBase(repoRoot, baseRef);
  if (mergeBase) {
    return gitLines(repoRoot, ["diff", "--name-only", `${mergeBase}...HEAD`]);
  }
  const tracked = gitLines(repoRoot, ["diff", "--name-only", "HEAD"]);
  const staged = gitLines(repoRoot, ["diff", "--name-only", "--cached"]);
  const untracked = gitLines(repoRoot, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...tracked, ...staged, ...untracked])];
}

function skillExistedAt(repoRoot, treeish, dirName) {
  const probe = spawnSync("git", ["cat-file", "-e", `${treeish}:skills/${dirName}/SKILL.md`], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return probe.status === 0;
}

function detectNewPartnerSkillDirs(repoRoot, mergeBase, partnerDirs) {
  if (!mergeBase) return [];
  const added = new Set(
    gitLines(repoRoot, ["diff", "--name-only", "--diff-filter=A", `${mergeBase}...HEAD`]),
  );
  return partnerDirs.filter((dirName) => added.has(`skills/${dirName}/SKILL.md`));
}

function existingSkillDirsOnBase(repoRoot, mergeBase) {
  if (!mergeBase) {
    return listSkillDirs(join(repoRoot, "skills"));
  }
  return listSkillDirs(join(repoRoot, "skills")).filter((dirName) =>
    skillExistedAt(repoRoot, mergeBase, dirName),
  );
}

export function main(argv = process.argv.slice(2)) {
  const { files, baseRef, repoRoot, newSkills, existingSkills } = parseArgs(argv);
  const changedFiles = files ?? detectChangedFiles(repoRoot, baseRef);
  const partnerDirs = collectTouchedPartnerSkillDirs(changedFiles);
  const mergeBase = resolveMergeBase(repoRoot, baseRef);

  const result = checkSkillContribution({
    changedFiles,
    repoRoot,
    existingSkillDirs: existingSkills ?? existingSkillDirsOnBase(repoRoot, mergeBase),
    newPartnerSkillDirs: newSkills ?? detectNewPartnerSkillDirs(repoRoot, mergeBase, partnerDirs),
  });

  console.log(result.message);
  if (!result.ok) {
    process.exitCode = 1;
  }
  return result;
}

const invokedAsCli =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  main();
}
