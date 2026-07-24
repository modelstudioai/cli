#!/usr/bin/env node
import { parseArgs } from "util";

import { runCheck } from "./check.mjs";
import { createTag, currentBranch, isWorkingTreeClean, pushTag, tagExists } from "./lib/git.mjs";
import { npmViewExists, pnpmPublish } from "./lib/npm.mjs";
import { ALL_PACKAGES, PACKAGES } from "./lib/packages.mjs";
import { releaseBinaryArtifacts } from "./lib/binary-release.mjs";

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function step(msg) {
  log(`\n==> ${msg}`);
}

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    knowledge: { type: "boolean", default: false },
    "skip-binary": { type: "boolean", default: false },
  },
  allowPositionals: false,
});
const dryRun = values["dry-run"];
const knowledge = values.knowledge;
const skipBinary = values["skip-binary"];
const packages = knowledge ? ALL_PACKAGES : PACKAGES;

try {
  if (!dryRun && !process.env.CI) {
    throw new Error("publish-stable is CI-only. Pass --dry-run to test locally.");
  }

  if (!dryRun) {
    step("preflight: working tree clean + on main");
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

  const { coreJson } = await runCheck({ knowledge });
  const version = coreJson.version; // all packages share this, asserted by runCheck

  step(`idempotency: check ${version} against registry`);
  const published = new Map();
  for (const pkg of packages) {
    const exists = npmViewExists(pkg.name, version);
    published.set(pkg.key, exists);
    log(`${pkg.name}@${version}: ${exists ? "already published" : "to publish"}`);
  }
  if (packages.every((pkg) => published.get(pkg.key))) {
    throw new Error(
      `version ${version} is already published for all target packages; bump the package versions before retrying.`,
    );
  }

  // 1) npm (dependency order: core → runtime → commands → cli [→ kscli])
  for (const pkg of packages) {
    if (published.get(pkg.key)) continue;
    step(`publish ${pkg.name}@${version} (tag=latest, provenance)`);
    pnpmPublish(pkg, { tag: "latest", provenance: true, dryRun });
  }

  // 2) git tag — must be on origin before the GitHub Release step (--verify-tag)
  const tag = `v${version}`;
  if (dryRun) {
    log("\n[dry-run] skipping git tag");
  } else if (tagExists(tag)) {
    log(`tag ${tag} already exists; skipping tag push`);
  } else {
    step(`tag ${tag} and push`);
    createTag(tag);
    pushTag(tag);
  }

  // 3) binary GitHub Release (same version; orchestrated here, not a separate release entry)
  if (skipBinary) {
    log("\n[skip-binary] skipping binary GitHub Release");
  } else {
    step(`publish binary GitHub Release (mode=stable, version=${version})`);
    await releaseBinaryArtifacts({ mode: "stable", dryRun });
  }

  const parts = ["npm"];
  if (!skipBinary) parts.push("binary");
  log(`\nstable release complete (${parts.join(" + ")}).`);
} catch (error) {
  process.stderr.write(`\nrelease publish-stable failed: ${error.message}\n`);
  process.exit(1);
}
