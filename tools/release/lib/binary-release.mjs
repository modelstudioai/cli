/**
 * Publish bailian-cli binary assets to GitHub Releases.
 *
 * stable:  release `v<version>` (tag must already be on origin; --verify-tag)
 *          assets: bl-*.zip, SHA256SUMS  (no latest.json)
 * channel: versioned prerelease `v<betaVersion>` (assets: bl-*.zip, SHA256SUMS)
 *          + rolling prerelease tag `channel-<name>` holding only `<name>.json`
 *
 * Same commit/day channel publishes share one `v<betaVersion>` Release (identical
 * binaries); only the rolling `channel-<name>` manifest differs per channel.
 *
 * Re-runs are idempotent via `gh release upload --clobber` (see gh-release.mjs).
 * After the GitHub upload the same assets are pushed straight to OSS from the
 * runner, HEAD-reconciled, and (stable only) release/manifest.json is updated —
 * all in-process, no external FC (see oss-direct-upload.mjs).
 *
 * Called by publish-stable.mjs / publish-channel.mjs.
 * Debug:
 *   node tools/release/lib/binary-release.mjs --mode stable --dry-run
 *   node tools/release/lib/binary-release.mjs --mode channel --channel beta --dry-run
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs as parseCliArgs } from "node:util";
import { ROOT, readPackageJson, PACKAGES } from "./packages.mjs";
import { buildBinaryArtifacts, matrixAssetNames } from "./binary-build.mjs";
import { channelManifestFileName, normalizeModeChannel } from "./binary-options.mjs";
import { ensureGh, GITHUB_REPOSITORY, upsertRelease } from "./gh-release.mjs";
import { maintainReleaseManifest, mirrorReleaseAssetsToOss } from "./oss-direct-upload.mjs";

const DEFAULT_DIR = join(ROOT, "dist-bin");

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

function assertFullMatrix(files, version) {
  const missing = matrixAssetNames(version).filter((name) => !files.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Incomplete binary matrix in dist-bin (missing: ${missing.join(", ")}). ` +
        `Rebuild the full matrix before upload (do not use --host / partial --target for release).`,
    );
  }
}

function versionBinaryAssets(dir, version, files) {
  assertFullMatrix(files, version);
  const matrixNames = new Set(matrixAssetNames(version));
  return files
    .filter((name) => matrixNames.has(name) || name === "SHA256SUMS")
    .map((name) => join(dir, name));
}

function uploadStable({ dir, version, files, dryRun }) {
  const section = extractChangelogSection(version);

  upsertRelease({
    tag: `v${version}`,
    title: `v${version}`,
    verifyTag: true,
    notes: section || undefined,
    assets: versionBinaryAssets(dir, version, files),
    dryRun,
  });
}

function uploadChannel({ dir, version, channel, files, dryRun }) {
  // Versioned tag is shared across channels built from the same beta version string.
  upsertRelease({
    tag: `v${version}`,
    title: `v${version}`,
    prerelease: true,
    notes: `Beta build for the \`${channel}\` channel.`,
    assets: versionBinaryAssets(dir, version, files),
    dryRun,
  });

  upsertRelease({
    tag: `channel-${channel}`,
    title: `channel: ${channel}`,
    prerelease: true,
    notes: `Rolling manifest for the \`${channel}\` channel. Latest beta: ${version}.`,
    assets: [join(dir, channelManifestFileName(channel))],
    dryRun,
  });
}

/** Dry-run path when dist-bin is absent: plan tags/assets without compiling. */
function planDryRunWithoutArtifacts({ version, mode, channel }) {
  const matrix = matrixAssetNames(version);
  if (mode === "stable") {
    upsertRelease({
      tag: `v${version}`,
      title: `v${version}`,
      verifyTag: true,
      notes: extractChangelogSection(version) || undefined,
      assets: [...matrix, "SHA256SUMS"],
      dryRun: true,
    });
    return;
  }
  upsertRelease({
    tag: `v${version}`,
    title: `v${version}`,
    prerelease: true,
    notes: `Beta build for the \`${channel}\` channel.`,
    assets: [...matrix, "SHA256SUMS"],
    dryRun: true,
  });
  upsertRelease({
    tag: `channel-${channel}`,
    title: `channel: ${channel}`,
    prerelease: true,
    notes: `Rolling manifest for the \`${channel}\` channel. Latest beta: ${version}.`,
    assets: [channelManifestFileName(channel)],
    dryRun: true,
  });
}

/**
 * Build the OSS mirror plan — the same tag/asset pairs as the GitHub Release
 * upload. `files == null` means dry-run planning without artifacts on disk,
 * so bare basenames stand in for real paths.
 */
function ossMirrorPlans({ dir, version, mode, channel, files }) {
  const paths = files
    ? versionBinaryAssets(dir, version, files)
    : [...matrixAssetNames(version), "SHA256SUMS"];
  const plans = [{ tag: `v${version}`, paths }];
  if (mode === "channel") {
    const manifest = channelManifestFileName(channel);
    // Rolling channel manifest lives at the OSS prefix root, next to
    // manifest.json / latest.json — one flat json per channel.
    plans.push({ tag: "", paths: [files ? join(dir, manifest) : manifest] });
  }
  return plans;
}

/**
 * Build (unless skipped / dry-run) and upload binary artifacts to GitHub Releases.
 * Called by publish-stable / publish-channel orchestrators.
 *
 * `--dry-run` never compiles; it plans gh release steps. Prebuilt `dist-bin` is
 * optional (used only to list real paths when present).
 */
export async function releaseBinaryArtifacts(rawOptions = {}) {
  const { mode, channel } = normalizeModeChannel(rawOptions.mode, rawOptions.channel);
  const dir = rawOptions.dir ? resolve(rawOptions.dir) : DEFAULT_DIR;
  const dryRun = Boolean(rawOptions.dryRun);
  const skipBuild = Boolean(rawOptions.skipBuild);
  const cliPkg = readPackageJson(PACKAGES.find((pkg) => pkg.key === "cli"));
  const version = cliPkg.version;

  if (dryRun) {
    process.stdout.write(
      `\n[dry-run] skipping binary build (mode=${mode}${channel ? ` channel=${channel}` : ""})\n`,
    );
  } else if (!skipBuild) {
    process.stdout.write(
      `\n==> build binary (mode=${mode}${channel ? ` channel=${channel}` : ""})\n`,
    );
    buildBinaryArtifacts({ mode, channel, outdir: dir });
  }

  process.stdout.write(`repo ${GITHUB_REPOSITORY}\n`);
  process.stdout.write(`version ${version}\n`);
  process.stdout.write(`mode ${mode}${channel ? ` channel=${channel}` : ""}\n`);

  if (dryRun && !existsSync(dir)) {
    process.stdout.write(`[dry-run] ${dir} missing; planning expected assets\n`);
    planDryRunWithoutArtifacts({ version, mode, channel });
    const plans = ossMirrorPlans({ dir, version, mode, channel, files: null });
    await mirrorReleaseAssetsToOss({ plans, dryRun: true });
    if (mode === "stable") {
      await maintainReleaseManifest({
        tag: `v${version}`,
        assetNames: plans[0].paths.map((path) => basename(path)),
        channelJsonPath: null,
        dryRun: true,
      });
    }
    return { version, mode, channel, dryRun };
  }

  if (!existsSync(dir)) {
    throw new Error(
      `Missing ${dir}. Run binary-build or omit --skip-build (mode=${mode}${channel ? ` channel=${channel}` : ""}).`,
    );
  }

  const files = readdirSync(dir).filter((name) => !name.startsWith("."));
  if (!files.includes("SHA256SUMS")) {
    throw new Error(`Missing SHA256SUMS in ${dir}`);
  }
  const rollingManifest = channelManifestFileName(mode === "channel" ? channel : "latest");
  if (!files.includes(rollingManifest)) {
    throw new Error(
      `Missing ${rollingManifest} in ${dir}. Rebuild with matching --mode/--channel (found: ${files.join(", ") || "(empty)"}).`,
    );
  }

  process.stdout.write(`artifacts in ${dir}:\n`);
  for (const name of files) process.stdout.write(`  ${name}\n`);

  // Validate matrix before touching gh, so --skip-build mistakes fail without network/CLI.
  assertFullMatrix(files, version);

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

  // Push the exact Release assets straight to OSS from the runner, then
  // HEAD-reconcile. Stable releases additionally maintain release/manifest.json
  // (newer-version guard). Throws on failure — CI is the only OSS writer.
  const plans = ossMirrorPlans({ dir, version, mode, channel, files });
  const mirror = await mirrorReleaseAssetsToOss({ plans, dryRun });
  if (mode === "stable" && !mirror.skipped) {
    await maintainReleaseManifest({
      tag: `v${version}`,
      assetNames: plans[0].paths.map((path) => basename(path)),
      channelJsonPath: join(dir, rollingManifest),
      dryRun,
    });
  }

  return { version, mode, channel, dryRun };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const USAGE =
    "Usage: node tools/release/lib/binary-release.mjs --mode stable|channel [--channel <name>] [--dir dist-bin] [--skip-build] [--dry-run]\n";
  try {
    const { values } = parseCliArgs({
      args: process.argv.slice(2),
      options: {
        dir: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        mode: { type: "string", default: "stable" },
        channel: { type: "string" },
        "skip-build": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: false,
    });
    if (values.help) {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    await releaseBinaryArtifacts({
      dir: values.dir ? resolve(values.dir) : undefined,
      dryRun: values["dry-run"],
      mode: values.mode,
      channel: values.channel ?? null,
      skipBuild: values["skip-build"],
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
