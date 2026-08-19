#!/usr/bin/env node
import { fileURLToPath } from "url";

import { packAndScan } from "./lib/pack-scan.mjs";
import { run } from "./lib/proc.mjs";
import { assertReadmeSync, loadAndValidatePackages } from "./lib/validate.mjs";
import { ALL_PACKAGES, PACKAGES } from "./lib/packages.mjs";

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
 * @param {{ channel?: boolean, knowledge?: boolean }} [options]
 * @param {boolean} [options.channel] — When true (publish-channel): regenerate
 *   `reference/` and assert it matches git, but do not sync `SKILL.md` from the
 *   temporary beta `package.json` version (repo skill stays aligned with stable).
 * @param {boolean} [options.knowledge] — When true: also build and validate
 *   knowledge-studio-cli alongside the base packages.
 */
export async function runCheck(options = {}) {
  const channel = options.channel === true;
  const knowledge = options.knowledge === true;
  const packages = knowledge ? ALL_PACKAGES : PACKAGES;

  step("pnpm install --frozen-lockfile");
  run("pnpm", ["install", "--frozen-lockfile"]);

  step("metadata: README sync, version consistency, workspace:* dep");
  assertReadmeSync();
  const { coreJson, cliJson } = loadAndValidatePackages({ packages });
  log(`bailian-cli-core@${coreJson.version}`);
  log(`bailian-cli@${cliJson.version}`);

  step("build bailian-cli dependencies (core, commands, runtime)");
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
    ...(channel
      ? []
      : [
          "skills/bailian-protocol/SKILL.md",
          "skills/bailian-cli/SKILL.md",
          "skills/bailian-gen/SKILL.md",
          "skills/bailian-finetune/SKILL.md",
          "skills/bailian-managed-agent/SKILL.md",
          "skills/bailian-web-search/SKILL.md",
        ]),
    "skills/bailian-cli/reference/",
    "skills/bailian-gen/reference/",
    "skills/bailian-finetune/reference/",
    "skills/bailian-managed-agent/reference/",
  ]);

  step("build bailian-cli");
  run("pnpm", ["--filter", "bailian-cli", "run", "build"]);

  if (knowledge) {
    step("build knowledge-studio-cli");
    run("pnpm", ["--filter", "knowledge-studio-cli", "run", "build"]);
  }

  step("pack + scan (publint, gitleaks)");
  packAndScan({ log, packages });

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
