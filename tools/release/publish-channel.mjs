#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";

import { runCheck } from "./check.mjs";
import { headSha7, utcDateStamp } from "./lib/git.mjs";
import { npmViewExists, pnpmPublish } from "./lib/npm.mjs";
import { PACKAGES, packageJsonPath, readPackageJson, writePackageJson } from "./lib/packages.mjs";
import { assertChannel } from "./lib/validate.mjs";

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
  },
  allowPositionals: false,
});
const channel = values.channel;
const dryRun = values["dry-run"];
assertChannel(channel);

if (!dryRun && !process.env.CI) {
  process.stderr.write("publish-channel is CI-only. Pass --dry-run to test locally.\n");
  process.exit(1);
}

// Snapshot every package.json so the temporary version bump is reverted in
// `finally`, even when the release fails midway.
const originals = PACKAGES.map((pkg) => {
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
  for (const pkg of PACKAGES) {
    const json = readPackageJson(pkg);
    json.version = betaVersion;
    writePackageJson(pkg, json);
  }
  // pnpm pack resolves `workspace:*` to the in-tree version, so each tarball
  // will depend on its siblings at <betaVersion> after this bump.

  await runCheck({ channel: true });

  step(`idempotency: check ${betaVersion} against registry`);
  const published = new Map();
  for (const pkg of PACKAGES) {
    const exists = npmViewExists(pkg.name, betaVersion);
    published.set(pkg.key, exists);
    log(`${pkg.name}@${betaVersion}: ${exists ? "already published" : "to publish"}`);
  }
  if (PACKAGES.every((pkg) => published.get(pkg.key))) {
    log("\nall packages already published; nothing to do.");
  } else {
    // Publish in dependency order (core → runtime → commands → cli).
    for (const pkg of PACKAGES) {
      if (published.get(pkg.key)) continue;
      step(`publish ${pkg.name}@${betaVersion} (tag=${channel}, provenance)`);
      pnpmPublish(pkg, { tag: channel, provenance: true, dryRun });
    }
  }

  log(`\nchannel release complete: ${channel}@${betaVersion}`);
} catch (error) {
  process.stderr.write(`\nrelease publish-channel failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  restoreOriginals();
}
