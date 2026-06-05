#!/usr/bin/env node
import { parseArgs } from "util";

import { runCheck } from "./check.mjs";
import { createTag, currentBranch, isWorkingTreeClean, pushTag, tagExists } from "./lib/git.mjs";
import { npmViewExists, pnpmPublish } from "./lib/npm.mjs";
import { findPackage } from "./lib/packages.mjs";

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function step(msg) {
  log(`\n==> ${msg}`);
}

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
  },
  allowPositionals: false,
});
const dryRun = values["dry-run"];

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

  const { coreJson } = await runCheck();
  const version = coreJson.version; // === cliJson.version, asserted by runCheck

  step(`idempotency: check ${version} against registry`);
  const core = findPackage("core");
  const cli = findPackage("cli");
  const corePublished = npmViewExists(core.name, version);
  const cliPublished = npmViewExists(cli.name, version);
  log(`${core.name}@${version}: ${corePublished ? "already published" : "to publish"}`);
  log(`${cli.name}@${version}: ${cliPublished ? "already published" : "to publish"}`);
  if (corePublished && cliPublished) {
    log("\nboth packages already published; nothing to do.");
    process.exit(0);
  }

  if (!corePublished) {
    step(`publish ${core.name}@${version} (tag=latest, provenance)`);
    pnpmPublish(core, { tag: "latest", provenance: true, dryRun });
  }
  if (!cliPublished) {
    step(`publish ${cli.name}@${version} (tag=latest, provenance)`);
    pnpmPublish(cli, { tag: "latest", provenance: true, dryRun });
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
