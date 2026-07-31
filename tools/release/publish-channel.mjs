#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";

import { runCheck } from "./check.mjs";
import { headSha7, utcDateStamp } from "./lib/git.mjs";
import { npmViewExists, pnpmPublish } from "./lib/npm.mjs";
import {
  ALL_PACKAGES,
  PACKAGES,
  packageJsonPath,
  readPackageJson,
  writePackageJson,
} from "./lib/packages.mjs";
import { assertChannel } from "./lib/validate.mjs";
import { releaseBinaryArtifacts } from "./lib/binary-release.mjs";

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function step(msg) {
  log(`\n==> ${msg}`);
}

const { values } = parseArgs({
  options: {
    channel: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    knowledge: { type: "boolean", default: false },
    "skip-binary": { type: "boolean", default: false },
  },
  allowPositionals: false,
});
const channel = values.channel;
const dryRun = values["dry-run"];
const knowledge = values.knowledge;
// knowledge-studio-cli channel publishes are npm-only: binary artifacts are `bl`
// and must not overwrite CDN sync-release.json used by bailian-cli install verify.
const skipBinary = values["skip-binary"] || knowledge;
const packages = knowledge ? ALL_PACKAGES : PACKAGES;
assertChannel(channel);

if (!dryRun && !process.env.CI) {
  process.stderr.write("publish-channel is CI-only. Pass --dry-run to test locally.\n");
  process.exit(1);
}

// Snapshot every package.json so the temporary version bump is reverted in
// `finally`, even when the release fails midway.
const originals = packages.map((pkg) => {
  const path = packageJsonPath(pkg);
  return { pkg, path, content: readFileSync(path, "utf-8") };
});

function restoreOriginals() {
  for (const { path, content } of originals) writeFileSync(path, content);
}

try {
  step("compute channel version");
  const sha = headSha7();
  const date = utcDateStamp();
  const betaVersion = `0.0.0-beta-${sha}-${date}`;
  log(`channel=${channel}  version=${betaVersion}`);

  step("temporarily bump package.json (not committed)");
  for (const pkg of packages) {
    const json = readPackageJson(pkg);
    json.version = betaVersion;
    writePackageJson(pkg, json);
  }

  await runCheck({ channel: true, knowledge });

  step(`idempotency: check ${betaVersion} against registry`);
  const published = new Map();
  for (const pkg of packages) {
    const exists = npmViewExists(pkg.name, betaVersion);
    published.set(pkg.key, exists);
    log(`${pkg.name}@${betaVersion}: ${exists ? "already published" : "to publish"}`);
  }
  if (packages.every((pkg) => published.get(pkg.key))) {
    log("\nall packages already published; nothing to do for npm.");
  } else {
    // 1) npm (dependency order: core → runtime → commands → cli [→ kscli])
    for (const pkg of packages) {
      if (published.get(pkg.key)) continue;
      step(`publish ${pkg.name}@${betaVersion} (tag=${channel}, provenance)`);
      pnpmPublish(pkg, { tag: channel, provenance: true, dryRun });
    }
  }

  // 2) binary GitHub Release — must run before finally restores package.json versions.
  // Channel binary always refreshes OSS sync-release.json (npm tag is independent).
  if (skipBinary) {
    const reason = knowledge
      ? "[knowledge] skipping binary (npm-only; does not touch sync-release.json)"
      : "[skip-binary] skipping binary GitHub Release";
    log(`\n${reason}`);
  } else {
    step(
      `publish binary GitHub Release (mode=channel, npm-tag=${channel}, CDN=sync-release, version=${betaVersion})`,
    );
    await releaseBinaryArtifacts({ mode: "channel", channel, dryRun });
  }

  const parts = ["npm"];
  if (!skipBinary) parts.push("binary/sync-release");
  log(`\nchannel release complete: ${channel}@${betaVersion} (${parts.join(" + ")})`);
} catch (error) {
  process.stderr.write(`\nrelease publish-channel failed: ${error.message}\n`);
  // Use exitCode (not process.exit) so `finally` can restore package.json bumps.
  process.exitCode = 1;
} finally {
  restoreOriginals();
}
