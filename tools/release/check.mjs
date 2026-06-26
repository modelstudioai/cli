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
 *
 * @param {{ channel?: boolean }} [options]
 * @param {boolean} [options.channel] — When true (publish-channel): regenerate
 *   `reference/` and assert it matches git, but do not sync `SKILL.md` from the
 *   temporary beta `package.json` version (repo skill stays aligned with stable).
 */
export async function runCheck(options = {}) {
  const channel = options.channel === true;

  step("pnpm install --frozen-lockfile");
  run("pnpm", ["install", "--frozen-lockfile"]);

  step("metadata: README sync, version consistency, workspace:* dep");
  assertReadmeSync();
  const { coreJson, cliJson } = loadAndValidatePackages();
  log(`bailian-cli-core@${coreJson.version}`);
  log(`bailian-cli@${cliJson.version}`);

  step("build library packages (core, runtime, commands)");
  // `bailian-cli^...` = all workspace dependencies of bailian-cli, in topological
  // order, excluding bailian-cli itself. generate:reference imports their dist.
  run("pnpm", ["--filter", "bailian-cli^...", "run", "build"]);

  step(
    channel
      ? "generate skill reference (channel: skip SKILL.md version sync)"
      : "generate skill reference + sync SKILL.md version",
  );
  run("pnpm", ["--filter", "bailian-cli", "run", "generate:reference"]);
  if (!channel) {
    run("pnpm", ["--filter", "bailian-cli", "run", "sync:skill-version"]);
  }

  step(
    channel
      ? "verify committed reference/ matches generator"
      : "verify committed skill assets match generators",
  );
  run("git", [
    "diff",
    "--exit-code",
    "--",
    ...(channel ? [] : ["skills/bailian-cli/SKILL.md"]),
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
