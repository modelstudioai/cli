#!/usr/bin/env node
import { parseArgs } from "util";

import { runCheck } from "./check.mjs";
import { createTag, currentBranch, isWorkingTreeClean, pushTag, tagExists } from "./lib/git.mjs";
import { npmViewExists, pnpmPublish } from "./lib/npm.mjs";
import { ALL_PACKAGES, PACKAGES } from "./lib/packages.mjs";

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
  },
  allowPositionals: false,
});
const dryRun = values["dry-run"];
const knowledge = values.knowledge;
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
    log("\nall packages already published; nothing to do.");
    process.exit(0);
  }

  // Publish in dependency order (core → runtime → commands → cli [→ kscli]).
  for (const pkg of packages) {
    if (published.get(pkg.key)) continue;
    step(`publish ${pkg.name}@${version} (tag=latest, provenance)`);
    pnpmPublish(pkg, { tag: "latest", provenance: true, dryRun });
  }

  if (dryRun) {
    log("\n[dry-run] skipping git tag");
    process.exit(0);
  }

  const tag = `v${version}`;
  if (tagExists(tag)) {
    log(`tag ${tag} already exists; skipping tag push`);
  } else {
    step(`tag ${tag} and push`);
    createTag(tag);
    pushTag(tag);
  }

  log("\nstable release complete.");
} catch (error) {
  process.stderr.write(`\nrelease publish-stable failed: ${error.message}\n`);
  process.exit(1);
}
