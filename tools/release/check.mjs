#!/usr/bin/env node
import { fileURLToPath } from "url";

import { packAndScan } from "./lib/pack-scan.mjs";
import { run } from "./lib/proc.mjs";
import { assertReadmeSync, loadAndValidatePackages } from "./lib/validate.mjs";

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function step(msg) {
  log(`\n==> ${msg}`);
}

/**
 * Pure-validation pipeline. Reusable from publish-stable / publish-channel.
 * Returns { coreJson, cliJson } for callers that need the parsed package.jsons.
 */
export async function runCheck() {
  step("pnpm install --frozen-lockfile");
  run("pnpm", ["install", "--frozen-lockfile"]);

  step("metadata: README sync, version consistency, workspace:* dep");
  assertReadmeSync();
  const { coreJson, cliJson } = loadAndValidatePackages();
  log(`bailian-cli-core@${coreJson.version}`);
  log(`bailian-cli@${cliJson.version}`);

  step("build bailian-cli-core");
  run("pnpm", ["--filter", "bailian-cli-core", "run", "build"]);

  step("generate skill reference + sync SKILL.md version");
  run("pnpm", ["--filter", "bailian-cli", "run", "generate:reference"]);
  run("pnpm", ["--filter", "bailian-cli", "run", "sync:skill-version"]);

  step("verify committed skill assets match generators");
  run("git", [
    "diff",
    "--exit-code",
    "--",
    "skills/bailian-cli/SKILL.md",
    "skills/bailian-cli/reference/",
  ]);

  step("build bailian-cli");
  run("pnpm", ["--filter", "bailian-cli", "run", "build"]);

  step("pack + scan (publint, gitleaks)");
  packAndScan({ log });

  log("\nrelease check passed.");
  return { coreJson, cliJson };
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runCheck();
  } catch (error) {
    process.stderr.write(`\nrelease check failed: ${error.message}\n`);
    process.exit(1);
  }
}
