#!/usr/bin/env node
/**
 * Publish an independent dsh plugin package (downstream host adapter).
 *
 * Deliberately independent from publish-stable.mjs / publish-channel.mjs:
 * - plugins are NOT in the version-locked bl release set (packages.mjs),
 * - they use tsc + tsdown instead of `vp pack`, and have no binary artifact,
 * - tags are `<package>-v<version>` so they never collide with bl `v<version>`.
 *
 * Usage:
 *   node tools/release/publish-dsh-plugin.mjs --package bailian-kb-dsh [--channel x] [--dry-run]
 *   node tools/release/publish-dsh-plugin.mjs --package bailian-memo-dsh [--channel x] [--dry-run]
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
import { assertChannel } from "./lib/validate.mjs";

const PLUGIN_PACKAGES = {
  "bailian-kb-dsh": {
    key: "kb-dsh",
    dir: "packages/bailian-kb-dsh",
    name: "bailian-kb-dsh",
  },
  "bailian-memo-dsh": {
    key: "memo-dsh",
    dir: "packages/bailian-memo-dsh",
    name: "bailian-memo-dsh",
  },
};

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function step(msg) {
  log(`\n==> ${msg}`);
}

const { values } = parseArgs({
  options: {
    package: { type: "string" },
    channel: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const packageName = values.package;
const channel = values.channel;
const dryRun = values["dry-run"];
const isChannel = channel !== undefined && channel !== "";

if (!packageName || !Object.hasOwn(PLUGIN_PACKAGES, packageName)) {
  process.stderr.write(
    `publish-dsh-plugin: --package must be one of ${Object.keys(PLUGIN_PACKAGES).join(", ")}\n`,
  );
  process.exit(1);
}

if (isChannel) assertChannel(channel);

const PKG = PLUGIN_PACKAGES[packageName];
const PKG_JSON_PATH = join(ROOT, PKG.dir, "package.json");

function readPackageJson() {
  return JSON.parse(readFileSync(PKG_JSON_PATH, "utf-8"));
}

function writePackageJson(json) {
  writeFileSync(PKG_JSON_PATH, `${JSON.stringify(json, null, 2)}\n`);
}

if (!dryRun && !process.env.CI) {
  process.stderr.write("publish-dsh-plugin is CI-only. Pass --dry-run to test locally.\n");
  process.exit(1);
}

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

  const originalVersion = readPackageJson().version;
  let publishVersion = originalVersion;
  if (isChannel) {
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
    const tempDir = mkdtempSync(join(tmpdir(), `${PKG.name}-release-`));
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
  process.stderr.write(`\nrelease publish-dsh-plugin failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  restoreOriginal();
}
