/**
 * Thin wrappers around `gh release` for create / clobber-upload / verify.
 * Shared by binary-release (and any future publish path that needs GitHub Releases).
 */
import { basename } from "node:path";
import { run, runCapture, tryRun } from "./proc.mjs";

export const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "modelstudioai/cli";

export function ensureGh() {
  if (tryRun("gh", ["--version"]).status !== 0) {
    throw new Error("gh CLI not found on PATH. Install from https://cli.github.com");
  }
}

export function releaseExists(tag, repo = GITHUB_REPOSITORY) {
  return tryRun("gh", ["release", "view", tag, "--repo", repo]).status === 0;
}

export function verifyReleaseAssets(tag, assetPaths, repo = GITHUB_REPOSITORY) {
  const output = runCapture("gh", [
    "release",
    "view",
    tag,
    "--repo",
    repo,
    "--json",
    "assets",
    "--jq",
    ".assets[].name",
  ]);
  const uploaded = new Set(output.split("\n").filter(Boolean));
  const missing = assetPaths.map((path) => basename(path)).filter((name) => !uploaded.has(name));
  if (missing.length > 0) {
    throw new Error(`release ${tag} is missing assets after upload: ${missing.join(", ")}`);
  }
}

function printPlanned(tag, assets, extraArgs, repo) {
  process.stdout.write(`[dry-run] gh release view ${tag} --repo ${repo}\n`);
  process.stdout.write(
    `[dry-run]   exists  → gh release upload ${tag} --repo ${repo} --clobber <assets>\n`,
  );
  process.stdout.write(
    `[dry-run]   missing → gh release create ${tag} --repo ${repo} ${extraArgs.join(" ")} <assets>\n`,
  );
  for (const asset of assets) process.stdout.write(`[dry-run]   asset: ${asset}\n`);
}

/**
 * Create a release with assets, or clobber-upload onto an existing one.
 *
 * @param {{
 *   tag: string,
 *   title: string,
 *   prerelease?: boolean,
 *   verifyTag?: boolean,
 *   notes?: string,
 *   notesFile?: string,
 *   assets: string[],
 *   dryRun?: boolean,
 *   repo?: string,
 * }} options
 */
export function upsertRelease({
  tag,
  title,
  prerelease,
  verifyTag,
  notes,
  notesFile,
  assets,
  dryRun,
  repo = GITHUB_REPOSITORY,
}) {
  const createArgs = ["--title", title];
  if (prerelease) createArgs.push("--prerelease", "--target", "main");
  if (verifyTag) createArgs.push("--verify-tag");
  if (notesFile) createArgs.push("--notes-file", notesFile);
  else if (notes) createArgs.push("--notes", notes);
  else createArgs.push("--generate-notes");

  if (dryRun) {
    printPlanned(tag, assets, createArgs, repo);
    return;
  }

  if (releaseExists(tag, repo)) {
    process.stdout.write(`release ${tag} exists; uploading assets with --clobber\n`);
    run("gh", ["release", "upload", tag, "--repo", repo, "--clobber", ...assets]);
  } else {
    run("gh", ["release", "create", tag, "--repo", repo, ...createArgs, ...assets]);
  }
  verifyReleaseAssets(tag, assets, repo);
}
