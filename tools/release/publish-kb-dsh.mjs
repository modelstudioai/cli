#!/usr/bin/env node
/**
 * Publish bailian-kb-dsh (dsh plugin, downstream host adapter).
 *
 * Deliberately independent from publish-stable.mjs / publish-channel.mjs:
 * - the plugin is NOT in the version-locked bl release set (packages.mjs
 *   PACKAGES / ALL_PACKAGES; see packages.mjs footer comment),
 * - it uses tsc + tsdown instead of `vp pack`, and has no binary artifact,
 * - it tags as `bailian-kb-dsh-v<version>` so its lightweight tags never
 *   collide with the bl `v<version>` namespace.
 *
 * Shared with the other publish scripts: dry-run gate, CI-only guard,
 * per-mode preflight, `pnpm publish --provenance`, publint + gitleaks scan.
 */
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";

import {
  createTag,
  currentBranch,
  headSha7,
  isWorkingTreeClean,
  pushTag,
  tagExists,
  utcDateStamp,
} from "./lib/git.mjs";
import { npmViewExists, pnpmPack, pnpmPublish } from "./lib/npm.mjs";
import { ROOT } from "./lib/packages.mjs";
import { run } from "./lib/proc.mjs";

const PKG = { key: "kb-dsh", dir: "packages/bailian-kb-dsh", name: "bailian-kb-dsh" };
const PKG_JSON_PATH = join(ROOT, PKG.dir, "package.json");

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function step(msg) {
  log(`\n==> ${msg}`);
}

function readPackageJson() {
  return JSON.parse(readFileSync(PKG_JSON_PATH, "utf-8"));
}

function writePackageJson(json) {
  writeFileSync(PKG_JSON_PATH, `${JSON.stringify(json, null, 2)}\n`);
}

const { values } = parseArgs({
  options: {
    channel: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});
const channel = values.channel;
const dryRun = values["dry-run"];
const isChannel = channel !== undefined && channel !== "";

if (!dryRun && !process.env.CI) {
  process.stderr.write("publish-kb-dsh is CI-only. Pass --dry-run to test locally.\n");
  process.exit(1);
}

// Snapshot for channel mode: the temporary version bump must be reverted in
// `finally`, even on mid-flight failure. Stable mode does not bump, so the
// snapshot is a no-op that keeps the restore path uniform.
const originalPackageJson = readFileSync(PKG_JSON_PATH, "utf-8");
function restoreOriginal() {
  writeFileSync(PKG_JSON_PATH, originalPackageJson);
}

try {
  if (isChannel) {
    step(`channel release: ${channel}`);
  } else {
    step("stable release");
    if (!dryRun) {
      if (!isWorkingTreeClean()) {
        throw new Error("git working tree is not clean; commit or stash first.");
      }
      const branch = currentBranch();
      if (branch !== "main") {
        throw new Error(`must publish from main, currently on ${branch}.`);
      }
    } else {
      log("[dry-run] skipping working-tree + branch preflight");
    }
  }

  // Resolve the version we are about to publish.
  const originalVersion = readPackageJson().version;
  let publishVersion = originalVersion;
  if (isChannel) {
    // Match the shape used by publish-channel.mjs (bl channel releases) so
    // consumers see a familiar dist-tag payload; the leading 0.0.0 keeps
    // semver from ever preferring a beta over a real release.
    const sha = headSha7();
    const stamp = utcDateStamp();
    publishVersion = `0.0.0-beta-${sha}-${stamp}`;
    step(`temporarily bump ${PKG.name} to ${publishVersion} (not committed)`);
    const json = readPackageJson();
    json.version = publishVersion;
    writePackageJson(json);
  }
  log(`${PKG.name}@${publishVersion}`);

  step(`build ${PKG.name}`);
  run("pnpm", ["--filter", PKG.name, "run", "build"]);

  step(`idempotency: check ${publishVersion} against registry`);
  const alreadyPublished = npmViewExists(PKG.name, publishVersion);
  log(`${PKG.name}@${publishVersion}: ${alreadyPublished ? "already published" : "to publish"}`);

  if (alreadyPublished) {
    if (!isChannel) {
      throw new Error(
        `version ${publishVersion} is already published; bump ${PKG.dir}/package.json before retrying.`,
      );
    }
    log("channel version already published; skipping npm publish");
  } else {
    step("pack + scan (publint, gitleaks)");
    const tempDir = mkdtempSync(join(tmpdir(), "bailian-kb-dsh-release-"));
    try {
      const packJson = readPackageJson();
      const tarball = pnpmPack(PKG, tempDir, packJson);
      run("tar", ["-xzf", tarball, "-C", tempDir], { stdio: "pipe" });
      const extractDir = join(tempDir, `extract-${PKG.key}`);
      renameSync(join(tempDir, "package"), extractDir);
      run("npx", ["--yes", "publint", extractDir]);
      run("gitleaks", ["detect", "--source", extractDir, "--no-git", "--redact"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    const npmTag = isChannel ? channel : "latest";
    step(`publish ${PKG.name}@${publishVersion} (tag=${npmTag}, provenance)`);
    pnpmPublish(PKG, { tag: npmTag, provenance: true, dryRun });
  }

  if (isChannel) {
    log(`\nchannel release complete: ${channel}@${publishVersion} (npm-only, no tag)`);
  } else {
    // Namespaced tag: bl uses `v<version>`, so we prefix with the package name
    // to avoid colliding when a bl release happens to share the same version
    // fragment.
    const tag = `${PKG.name}-v${publishVersion}`;
    if (dryRun) {
      log("\n[dry-run] skipping git tag");
    } else if (tagExists(tag)) {
      log(`tag ${tag} already exists; skipping tag push`);
    } else {
      step(`tag ${tag} and push`);
      createTag(tag);
      pushTag(tag);
    }
    log(`\nstable release complete: ${PKG.name}@${publishVersion} (npm + tag)`);
  }
} catch (error) {
  process.stderr.write(`\nrelease publish-kb-dsh failed: ${error.message}\n`);
  // Use exitCode (not process.exit) so `finally` restores any channel bump.
  process.exitCode = 1;
} finally {
  restoreOriginal();
}
