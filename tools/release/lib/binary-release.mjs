/**
 * Publish bailian-cli binary assets to GitHub Releases via the `gh` CLI.
 *
 * stable:  release `v<version>` (tag must already be on origin; --verify-tag)
 *          assets: bl-*, SHA256SUMS, latest.json
 * channel: versioned prerelease `v<betaVersion>` (assets: bl-*, SHA256SUMS)
 *          + rolling prerelease tag `channel-<name>` holding only `<name>.json`
 *
 * Re-runs are idempotent: existing releases get `gh release upload --clobber`.
 * Optionally POSTs BAILIAN_OSS_SYNC_WEBHOOK so an external FC can mirror to OSS.
 *
 * Called by publish-stable.mjs / publish-channel.mjs.
 * Debug:
 *   node tools/release/lib/binary-release.mjs --mode stable --dry-run
 *   node tools/release/lib/binary-release.mjs --mode channel --channel beta --dry-run
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readPackageJson, PACKAGES } from "./packages.mjs";
import { BINARY_TARGETS, buildBinaryArtifacts } from "./binary-build.mjs";
import { run, runCapture, tryRun } from "./proc.mjs";
import { assertChannel } from "./validate.mjs";

const REPO = process.env.GITHUB_REPOSITORY || "modelstudioai/cli";

function parseArgs(argv) {
  let dir = join(ROOT, "dist-bin");
  let dryRun = false;
  let mode = "stable";
  let channel = null;
  let skipBuild = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dir") dir = resolve(argv[++index]);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--mode") mode = argv[++index];
    else if (arg === "--channel") channel = argv[++index];
    else if (arg === "--skip-build") skipBuild = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node tools/release/lib/binary-release.mjs --mode stable|channel [--channel <name>] [--dir dist-bin] [--skip-build] [--dry-run]\n",
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return normalizeOptions({ dir, dryRun, mode, channel, skipBuild });
}

function normalizeOptions({ dir, dryRun, mode, channel, skipBuild = false }) {
  if (mode !== "stable" && mode !== "channel") {
    throw new Error(`--mode must be stable or channel, got: ${mode}`);
  }
  if (mode === "channel") {
    if (!channel) throw new Error("--mode channel requires --channel <name>");
    assertChannel(channel);
    if (channel === "stable") {
      throw new Error(`--channel cannot be "stable"; use --mode stable`);
    }
  }
  return {
    dir: dir ?? join(ROOT, "dist-bin"),
    dryRun: Boolean(dryRun),
    mode,
    channel: mode === "channel" ? channel : null,
    skipBuild: Boolean(skipBuild),
  };
}

function requiredManifestName(mode, channel) {
  return mode === "stable" ? "latest.json" : `${channel}.json`;
}

function ensureGh() {
  if (tryRun("gh", ["--version"]).status !== 0) {
    throw new Error("gh CLI not found on PATH. Install from https://cli.github.com");
  }
}

function releaseExists(tag) {
  return tryRun("gh", ["release", "view", tag, "--repo", REPO]).status === 0;
}

function verifyReleaseAssets(tag, assetPaths) {
  const output = runCapture("gh", [
    "release",
    "view",
    tag,
    "--repo",
    REPO,
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

/** Extract the `## [<version>]` section from CHANGELOG.md, or null when absent. */
function extractChangelogSection(version) {
  const lines = readFileSync(join(ROOT, "CHANGELOG.md"), "utf-8").split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## ["));
  const section = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return section ? `${section}\n` : null;
}

function printPlanned(tag, assets, extraArgs) {
  process.stdout.write(`[dry-run] gh release view ${tag} --repo ${REPO}\n`);
  process.stdout.write(
    `[dry-run]   exists  → gh release upload ${tag} --repo ${REPO} --clobber <assets>\n`,
  );
  process.stdout.write(
    `[dry-run]   missing → gh release create ${tag} --repo ${REPO} ${extraArgs.join(" ")} <assets>\n`,
  );
  for (const asset of assets) process.stdout.write(`[dry-run]   asset: ${asset}\n`);
}

/**
 * Create a release with assets, or clobber-upload onto an existing one.
 * options: { tag, title, prerelease, verifyTag, notes, notesFile, assets, dryRun }
 */
function upsertRelease({ tag, title, prerelease, verifyTag, notes, notesFile, assets, dryRun }) {
  const createArgs = ["--title", title];
  if (prerelease) createArgs.push("--prerelease", "--target", "main");
  if (verifyTag) createArgs.push("--verify-tag");
  if (notesFile) createArgs.push("--notes-file", notesFile);
  else if (notes) createArgs.push("--notes", notes);
  else createArgs.push("--generate-notes");

  if (dryRun) {
    printPlanned(tag, assets, createArgs);
    return;
  }

  if (releaseExists(tag)) {
    process.stdout.write(`release ${tag} exists; uploading assets with --clobber\n`);
    run("gh", ["release", "upload", tag, "--repo", REPO, "--clobber", ...assets]);
  } else {
    run("gh", ["release", "create", tag, "--repo", REPO, ...createArgs, ...assets]);
  }
  verifyReleaseAssets(tag, assets);
}

function uploadStable({ dir, version, files, dryRun }) {
  const tag = `v${version}`;
  const matrixNames = new Set(
    BINARY_TARGETS.map(
      (target) => `bl-${version}-${target.os}-${target.arch}${target.exe ? ".exe" : ""}`,
    ),
  );
  // Binaries + checksums + latest.json only. Production install.sh/ps1 are maintained
  // outside this repo and served from OSS after an external FC sync.
  const wanted = files.filter(
    (name) => matrixNames.has(name) || name === "SHA256SUMS" || name === "latest.json",
  );
  const assets = wanted.map((name) => join(dir, name));

  const section = extractChangelogSection(version);

  upsertRelease({
    tag,
    title: tag,
    verifyTag: true,
    notes: section || undefined,
    assets,
    dryRun,
  });
}

function uploadChannel({ dir, version, channel, files, dryRun }) {
  const matrixNames = new Set(
    BINARY_TARGETS.map(
      (target) => `bl-${version}-${target.os}-${target.arch}${target.exe ? ".exe" : ""}`,
    ),
  );
  const binaries = files
    .filter((name) => matrixNames.has(name) || name === "SHA256SUMS")
    .map((name) => join(dir, name));
  upsertRelease({
    tag: `v${version}`,
    title: `v${version}`,
    prerelease: true,
    notes: `Beta build for the \`${channel}\` channel.`,
    assets: binaries,
    dryRun,
  });

  upsertRelease({
    tag: `channel-${channel}`,
    title: `channel: ${channel}`,
    prerelease: true,
    notes: `Rolling manifest for the \`${channel}\` channel. Latest beta: ${version}.`,
    assets: [join(dir, `${channel}.json`)],
    dryRun,
  });
}

/**
 * Optional hook for an external FC that mirrors GitHub Releases → OSS.
 * Set BAILIAN_OSS_SYNC_WEBHOOK to an HTTP endpoint; unset → no-op.
 */
function notifyOssSyncWebhook({ version, mode, channel, dryRun }) {
  const webhook = process.env.BAILIAN_OSS_SYNC_WEBHOOK?.trim();
  if (!webhook) {
    process.stdout.write(
      "\n[info] BAILIAN_OSS_SYNC_WEBHOOK unset; skip notifying external OSS sync FC\n",
    );
    return;
  }
  const tag = mode === "stable" ? `v${version}` : `v${version}`;
  const body = {
    repo: REPO,
    mode,
    channel,
    version,
    tag,
    rollingChannelTag: mode === "channel" ? `channel-${channel}` : null,
  };
  if (dryRun) {
    process.stdout.write(`[dry-run] POST ${webhook}\n${JSON.stringify(body, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\n==> notify OSS sync FC: ${webhook}\n`);
  const result = tryRun("curl", [
    "-fsS",
    "-X",
    "POST",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify(body),
    webhook,
  ]);
  if (result.status !== 0) {
    process.stdout.write(
      `[warn] OSS sync webhook failed (release already published): ${result.stderr || result.stdout}\n`,
    );
    return;
  }
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
}

/**
 * Build (unless skipped) and upload binary artifacts to GitHub Releases.
 * Called by publish-stable / publish-channel orchestrators.
 */
export function releaseBinaryArtifacts(rawOptions) {
  const { dir, dryRun, mode, channel, skipBuild } = normalizeOptions(rawOptions);
  const cliPkg = readPackageJson(PACKAGES.find((pkg) => pkg.key === "cli"));
  const version = cliPkg.version;

  if (!skipBuild) {
    process.stdout.write(
      `\n==> build binary (mode=${mode}${channel ? ` channel=${channel}` : ""})\n`,
    );
    buildBinaryArtifacts({ mode, channel, outdir: dir });
  }

  if (!existsSync(dir)) {
    throw new Error(
      `Missing ${dir}. Run binary-build or omit --skip-build (mode=${mode}${channel ? ` channel=${channel}` : ""}).`,
    );
  }

  const files = readdirSync(dir).filter((name) => !name.startsWith("."));
  const manifestName = requiredManifestName(mode, channel);
  if (!files.includes(manifestName)) {
    throw new Error(
      `Missing ${manifestName} in ${dir}. Rebuild with matching --mode/--channel (found: ${files.join(", ") || "(empty)"}).`,
    );
  }
  if (!files.includes("SHA256SUMS")) {
    throw new Error(`Missing SHA256SUMS in ${dir}`);
  }

  process.stdout.write(`repo ${REPO}\n`);
  process.stdout.write(`version ${version}\n`);
  process.stdout.write(`mode ${mode}${channel ? ` channel=${channel}` : ""}\n`);
  process.stdout.write(`artifacts in ${dir}:\n`);
  for (const name of files) process.stdout.write(`  ${name}\n`);

  if (dryRun) {
    process.stdout.write("\n[dry-run] skipping GitHub Release upload\n");
  } else {
    ensureGh();
  }

  if (mode === "stable") {
    uploadStable({ dir, version, files, dryRun });
  } else {
    uploadChannel({ dir, version, channel, files, dryRun });
  }

  notifyOssSyncWebhook({ version, mode, channel, dryRun });

  return { version, mode, channel, dryRun };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    releaseBinaryArtifacts(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
