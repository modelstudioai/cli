#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";

import { runCheck } from "./check.mjs";
import { headSha7, utcDateStamp } from "./lib/git.mjs";
import { npmViewExists, pnpmPublish } from "./lib/npm.mjs";
import {
  findPackage,
  packageJsonPath,
  readPackageJson,
  writePackageJson,
} from "./lib/packages.mjs";
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

const core = findPackage("core");
const cli = findPackage("cli");
const corePath = packageJsonPath(core);
const cliPath = packageJsonPath(cli);
const coreOriginal = readFileSync(corePath, "utf-8");
const cliOriginal = readFileSync(cliPath, "utf-8");

function restoreOriginals() {
  writeFileSync(corePath, coreOriginal);
  writeFileSync(cliPath, cliOriginal);
}

try {
  step("compute channel version");
  const sha = headSha7();
  const date = utcDateStamp();
  const betaVersion = `0.0.0-beta-${sha}-${date}`;
  log(`channel=${channel}  version=${betaVersion}`);

  step("temporarily bump package.json (not committed)");
  const coreJson = readPackageJson(core);
  const cliJson = readPackageJson(cli);
  coreJson.version = betaVersion;
  cliJson.version = betaVersion;
  writePackageJson(core, coreJson);
  writePackageJson(cli, cliJson);
  // pnpm pack resolves `workspace:*` to the in-tree version, so CLI tarball
  // will depend on bailian-cli-core@<betaVersion> after this bump.

  await runCheck();

  step(`idempotency: check ${betaVersion} against registry`);
  const corePublished = npmViewExists(core.name, betaVersion);
  const cliPublished = npmViewExists(cli.name, betaVersion);
  log(`${core.name}@${betaVersion}: ${corePublished ? "already published" : "to publish"}`);
  log(`${cli.name}@${betaVersion}: ${cliPublished ? "already published" : "to publish"}`);
  if (corePublished && cliPublished) {
    log("\nboth packages already published; nothing to do.");
  } else {
    if (!corePublished) {
      step(`publish ${core.name}@${betaVersion} (tag=${channel}, provenance)`);
      pnpmPublish(core, { tag: channel, provenance: true, dryRun });
    }
    if (!cliPublished) {
      step(`publish ${cli.name}@${betaVersion} (tag=${channel}, provenance)`);
      pnpmPublish(cli, { tag: channel, provenance: true, dryRun });
    }
  }

  log(`\nchannel release complete: ${channel}@${betaVersion}`);
} catch (error) {
  process.stderr.write(`\nrelease publish-channel failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  restoreOriginals();
}
