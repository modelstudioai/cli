import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { migrateConfig } from "@openagentpack/sdk";
import { parse as parseYaml } from "yaml";
import { withAgentErrors } from "./_engine/errors.ts";

/** bl's migrate is bailian-only: the merge target must resolve to bailian. */
const MIGRATE_PROVIDER = "bailian";

const MIGRATE_FLAGS = {
  from: {
    type: "string",
    valueHint: "<path>",
    description: "Synced config to migrate from (default: agents.synced.yaml)",
  },
  to: {
    type: "string",
    valueHint: "<path>",
    description: "Target agents.yaml to merge into (default: agents.yaml)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Merge a synced config into a bailian agents.yaml",
  auth: "apiKey",
  usageArgs: "[--from <path>] [--to <path>]",
  flags: MIGRATE_FLAGS,
  exampleArgs: ["", "--from agents.synced.yaml --to agents.yaml"],
  notes: [
    "The merge itself runs against local files; bl's unified apiKey gate still applies — login via `bl auth login`, pass --api-key, or set DASHSCOPE_API_KEY.",
    "Only a bailian-target agents.yaml is supported: migrated resources are re-pointed to provider bailian, with models/tools/environments normalized to Bailian-supported values.",
    "Resources whose YAML key already exists in the target are skipped, never overwritten.",
    "Run `bl managed-agent plan` afterwards to review the merged config before apply.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const fromPath = flags.from ?? "agents.synced.yaml";
    const toPath = flags.to ?? "agents.yaml";

    // Aligned with the other managed-agent commands: dry-run short-circuits
    // first and only echoes the planned action — no file I/O, no validation.
    if (settings.dryRun) {
      emitResult({ would_migrate: { from: fromPath, to: toPath } }, format);
      return;
    }

    const result = await withAgentErrors(async () => {
      await assertBailianTarget(toPath);
      return migrateConfig({ fromPath, toPath });
    });

    await writeFile(toPath, result.yaml, "utf8");

    if (format === "json") {
      emitResult(
        { migrated: toPath, from: fromPath, added: result.added, skipped: result.skipped },
        format,
      );
      return;
    }

    const addedParts = Object.entries(result.added).map(([group, count]) => `${count} ${group}`);
    const skippedParts = Object.entries(result.skipped).map(
      ([group, count]) => `${count} ${group}`,
    );

    if (addedParts.length > 0) {
      emitBare(`Migrated ${addedParts.join(", ")} into ${toPath}.`);
    } else {
      emitBare("No new resources to migrate (all already exist in target).");
    }
    if (skippedParts.length > 0) {
      emitBare(`Skipped (already exist): ${skippedParts.join(", ")}.`);
    }
    if (addedParts.length > 0) {
      // `bl` prefix is safe: agent commands ship on `bl` only.
      emitBare("Next: run `bl managed-agent plan` to review the merged config.");
    }
  },
});

/**
 * Enforce the bailian-only contract before merging: the target file must exist
 * and its provider (defaults.provider, else the first providers key) must be
 * bailian. An undeterminable provider is left to the SDK's own error.
 */
async function assertBailianTarget(toPath: string): Promise<void> {
  if (!existsSync(toPath)) {
    throw new BailianError(
      `Target file '${toPath}' not found.`,
      ExitCode.USAGE,
      // `bl` prefix is safe: agent commands ship on `bl` only.
      "Create it first with `bl managed-agent init`, then re-run migrate.",
    );
  }
  const parsed: unknown = parseYaml(await readFile(toPath, "utf8"));
  if (!parsed || typeof parsed !== "object") return;
  const config = parsed as Record<string, unknown>;

  const defaults = config.defaults as Record<string, unknown> | undefined;
  const providers = config.providers as Record<string, unknown> | undefined;
  const targetProvider =
    typeof defaults?.provider === "string" && defaults.provider
      ? defaults.provider
      : Object.keys(providers ?? {})[0];

  if (targetProvider && targetProvider !== MIGRATE_PROVIDER) {
    throw new BailianError(
      `Target provider '${targetProvider}' is not supported: migrate only targets the ${MIGRATE_PROVIDER} provider.`,
      ExitCode.USAGE,
      `Set defaults.provider to ${MIGRATE_PROVIDER} (or make ${MIGRATE_PROVIDER} the providers block) in '${toPath}'.`,
    );
  }
}
