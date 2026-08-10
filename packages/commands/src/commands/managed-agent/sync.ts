import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import {
  type ProjectRuntimeContext,
  type SyncProjectResult,
  syncProviderResourcesFromContext,
} from "@openagentpack/sdk";
import { stringify as stringifyYaml } from "yaml";
import {
  assertProviderConfigured,
  buildAgentRuntime,
  CREDENTIALS_NOTE,
} from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import {
  narrowGroupToRemoteId,
  resolveSkillKeysByIds,
  type SelectableResourceType,
  SYNCABLE_TYPES,
  type SyncableType,
} from "./_engine/sync-selection.ts";

/** bl's sync is bailian-only: the reverse-export source is always AgentStudio. */
const SYNC_PROVIDER = "bailian";

const DEFAULT_SYNC_OUTPUT = "agents.synced.yaml";

const SYNC_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  out: {
    type: "string",
    valueHint: "<path>",
    description: `Output path for the synced config (default: ${DEFAULT_SYNC_OUTPUT})`,
  },
  types: {
    type: "string",
    valueHint: "<list>",
    description: `Comma-separated resource types to sync: ${SYNCABLE_TYPES.join(", ")} (default: all)`,
  },
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: "Sync a single agent by its remote ID (plus the skills it references)",
  },
  environmentId: {
    type: "string",
    valueHint: "<id>",
    description: "Sync a single environment by its remote ID",
  },
  vaultId: {
    type: "string",
    valueHint: "<id>",
    description: "Sync a single vault by its remote ID",
  },
  fileId: {
    type: "string",
    valueHint: "<id>",
    description: "Sync a single file resource by its remote ID",
  },
  skillId: {
    type: "string",
    valueHint: "<id>",
    description: "Sync a single skill by its remote ID (overrides --agent-id skill narrowing)",
  },
  force: {
    type: "switch",
    description: "Overwrite an existing output file",
  },
  skipMissingFiles: {
    type: "switch",
    description: "Drop file resources whose local source is missing instead of keeping them",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Export remote bailian resources into a local synced config",
  auth: "apiKey",
  usageArgs:
    "[--types <list>] [--agent-id|--environment-id|--vault-id|--file-id|--skill-id <id>] [--file <path>] [--out <path>] [--force] [--skip-missing-files]",
  flags: SYNC_FLAGS,
  exampleArgs: [
    "",
    "--types agent,skill",
    "--agent-id agent-abc123",
    "--skill-id skill-xyz --types skill",
    "--force --skip-missing-files",
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    "Syncs from the bailian provider only: remote AgentStudio resources (environments, vaults, files, skills, agents) are exported into a local synced config for review.",
    "--types narrows the export to the listed resource types (plural spellings accepted); sessions are runtime instances, not syncable resources.",
    "With --agent-id, the agents group keeps only that agent (yaml key = remote agent ID) and its referenced custom skills are synced along — the skill group is exported even when --types omits it; official skill references need no local entry.",
    "Bailian binds environments/vaults/files at the session level, not on the agent, so --agent-id keeps those groups as shared infrastructure.",
    "Each --environment-id/--vault-id/--file-id/--skill-id narrows its own resource group to the single remote resource (yaml key resolved from the remote listing); combine with --types for a minimal output.",
    "Requires an agents.yaml with a bailian provider block — run `bl managed-agent init` first.",
    "Secrets are never exported: vault credentials keep ${ENV} placeholders; set those env vars locally before apply.",
    "Merge the synced config into agents.yaml with `bl managed-agent migrate`.",
  ],
  validate: (flagValues) => {
    if (!flagValues.types) return undefined;
    const { types, invalid } = parseSyncTypes(flagValues.types);
    if (invalid.length > 0) {
      return `--types contains unsupported values: ${invalid.join(", ")}. Valid types: ${SYNCABLE_TYPES.join(", ")}.`;
    }
    if (types.length === 0) {
      return `--types must list at least one of: ${SYNCABLE_TYPES.join(", ")}.`;
    }
    const idFlagByType: Record<SyncableType, string | undefined> = {
      agent: flagValues.agentId,
      environment: flagValues.environmentId,
      vault: flagValues.vaultId,
      file: flagValues.fileId,
      skill: flagValues.skillId,
    };
    for (const [selectionType, value] of Object.entries(idFlagByType)) {
      if (value && !types.includes(selectionType as SyncableType)) {
        return `--${selectionType}-id requires --types to include ${selectionType}.`;
      }
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const out = flags.out ?? DEFAULT_SYNC_OUTPUT;
    // undefined → the SDK exports every syncable type.
    let types = flags.types ? parseSyncTypes(flags.types).types : undefined;
    // --agent-id pulls the agent's referenced skills along, so the skill group
    // is exported even when --types omits it.
    if (types && flags.agentId && !types.includes("skill")) types = [...types, "skill"];
    // Per-group single-resource selections, resolved by remote ID after export.
    const resourceSelections: Partial<Record<SelectableResourceType, string>> = {
      environment: flags.environmentId,
      vault: flags.vaultId,
      file: flags.fileId,
      skill: flags.skillId,
    };

    // Aligned with the other managed-agent commands: dry-run short-circuits
    // first and only echoes the planned action — no guards, no file I/O.
    if (settings.dryRun) {
      emitResult(
        {
          would_sync: {
            provider: SYNC_PROVIDER,
            config_file: file,
            out,
            types,
            agent_id: flags.agentId,
            environment_id: flags.environmentId,
            vault_id: flags.vaultId,
            file_id: flags.fileId,
            skill_id: flags.skillId,
          },
        },
        format,
      );
      return;
    }

    if (existsSync(out) && !flags.force) {
      throw new BailianError(
        `${out} already exists.`,
        ExitCode.USAGE,
        "Pass --force to overwrite, or --out to write elsewhere.",
      );
    }

    const { result, agentFilter, selectedKeys } = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        assertProviderConfigured(runtime, SYNC_PROVIDER);
        const synced = await syncProviderResourcesFromContext(runtime, {
          provider: SYNC_PROVIDER,
          types,
        });
        // An explicit --skill-id wins over the agent's referenced-skill narrowing.
        const filtered = flags.agentId
          ? await filterConfigToAgent(runtime, synced, flags.agentId, {
              narrowSkills: !flags.skillId,
            })
          : undefined;
        const keptKeys: Partial<Record<SelectableResourceType, string>> = {};
        for (const [selectionType, remoteId] of Object.entries(resourceSelections)) {
          if (!remoteId) continue;
          keptKeys[selectionType as SelectableResourceType] = await narrowGroupToRemoteId(
            runtime,
            SYNC_PROVIDER,
            synced,
            selectionType as SelectableResourceType,
            remoteId,
          );
        }
        return { result: synced, agentFilter: filtered, selectedKeys: keptKeys };
      }),
    );

    const narrowed = Boolean(agentFilter) || Object.keys(selectedKeys).length > 0;
    const baseDir = dirname(out);
    const removedFiles = flags.skipMissingFiles
      ? removeMissingFileSources(result.config, baseDir)
      : [];
    const yamlContent =
      narrowed || removedFiles.length > 0
        ? stringifyYaml(result.config, { lineWidth: 0 })
        : result.yaml;
    await writeFile(out, yamlContent, "utf8");

    const downloadedSkillFiles = await writeDownloadedSkillFiles(result, baseDir);
    // Custom skills whose content could not be downloaded need local files
    // before an apply would round-trip; surface them instead of prompting.
    const missingSkillSources = collectMissingSkillSources(result.config, baseDir);
    const secretEnvVars = (result.secretPlaceholders ?? []).map(
      (placeholder) => placeholder.envVar,
    );

    if (format === "json") {
      emitResult(
        {
          synced: out,
          provider: SYNC_PROVIDER,
          agent_id: flags.agentId,
          selected_keys: Object.keys(selectedKeys).length > 0 ? selectedKeys : undefined,
          counts: result.counts,
          skill_files_downloaded: downloadedSkillFiles,
          removed_files: removedFiles,
          missing_skill_sources: missingSkillSources,
          secret_env_vars: secretEnvVars,
          unmatched_skill_refs: agentFilter?.unmatchedSkillIds,
        },
        format,
      );
      return;
    }

    const countParts = Object.entries(result.counts).map(([type, count]) => `${count} ${type}(s)`);
    emitBare(
      `Synced ${countParts.length > 0 ? countParts.join(", ") : "0 resources"} from ${SYNC_PROVIDER} into ${out}.`,
    );
    if (agentFilter) {
      emitBare(
        agentFilter.keptSkills
          ? `Narrowed to agent ${flags.agentId} (kept ${agentFilter.keptSkills.length} referenced skill(s)).`
          : `Narrowed to agent ${flags.agentId}.`,
      );
      if (agentFilter.unmatchedSkillIds.length > 0) {
        emitBare(
          `Skill references without a matching skills entry (kept on the agent as-is): ${agentFilter.unmatchedSkillIds.join(", ")}.`,
        );
      }
    }
    for (const [selectionType, keptKey] of Object.entries(selectedKeys)) {
      const requestedId = resourceSelections[selectionType as SelectableResourceType];
      emitBare(
        `Narrowed ${selectionType} to ${requestedId}${keptKey !== requestedId ? ` (key: ${keptKey})` : ""}.`,
      );
    }
    if (downloadedSkillFiles > 0) {
      emitBare(`Downloaded ${downloadedSkillFiles} skill file(s) into ./skills/.`);
    }
    if (removedFiles.length > 0) {
      emitBare(
        `Removed ${removedFiles.length} file resource(s) with missing local sources: ${removedFiles.join(", ")}.`,
      );
    }
    if (missingSkillSources.length > 0) {
      emitBare(
        `Missing local skill sources (provide the files before apply): ${missingSkillSources.join(", ")}.`,
      );
    }
    if (secretEnvVars.length > 0) {
      emitBare(`Set these env vars locally before apply: ${secretEnvVars.join(", ")}.`);
    }
    // `bl` prefix is safe: agent commands ship on `bl` only.
    emitBare(
      `Next: review ${out}, then run \`bl managed-agent migrate\` to merge it into agents.yaml.`,
    );
  },
});

/**
 * Parse the --types list. Accepts singular and plural spellings ("skills" →
 * "skill") and dedupes; invalid tokens are returned verbatim so validate()
 * can reject them with the original user input.
 */
function parseSyncTypes(raw: string): { types: SyncableType[]; invalid: string[] } {
  const types: SyncableType[] = [];
  const invalid: string[] = [];
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const singular = token.endsWith("s") ? token.slice(0, -1) : token;
    const matched = SYNCABLE_TYPES.find(
      (candidate) => candidate === token || candidate === singular,
    );
    if (!matched) {
      invalid.push(token);
    } else if (!types.includes(matched)) {
      types.push(matched);
    }
  }
  return { types, invalid };
}

/** Result of narrowing a synced config to a single agent. */
interface AgentFilterResult {
  /** Undefined when skills narrowing was skipped (--skill-id takes over). */
  keptSkills?: string[];
  unmatchedSkillIds: string[];
}

/**
 * Narrow a full synced config to a single agent: the agents group keeps only
 * the entry whose yaml key equals the remote agent ID, and — unless an
 * explicit --skill-id selection takes over (`narrowSkills: false`) — the
 * skills group keeps only the custom skills that agent references (official
 * skills live in the provider catalog and need no local entry). Skill
 * references carry remote skill IDs while skills-group keys are
 * metadata/display-name derived, so key misses are resolved through the
 * custom skill catalog before being surfaced as unmatched (never silently
 * dropped from the agent itself). Downloaded skill files and counts are
 * re-scoped to what remains.
 */
async function filterConfigToAgent(
  runtime: ProjectRuntimeContext,
  result: SyncProjectResult,
  agentId: string,
  options: { narrowSkills: boolean },
): Promise<AgentFilterResult> {
  const config = result.config;
  const agents = (config.agents ?? {}) as Record<string, Record<string, unknown>>;
  const selected = agents[agentId];
  if (!selected) {
    const available = Object.keys(agents);
    throw new BailianError(
      `Agent '${agentId}' not found on the remote workspace.`,
      ExitCode.USAGE,
      available.length > 0
        ? `Available agent IDs: ${available.join(", ")}.`
        : "The workspace has no syncable (non-archived) agents.",
    );
  }
  config.agents = { [agentId]: selected };
  if ("agent" in result.counts) result.counts.agent = 1;
  if (!options.narrowSkills) {
    return { unmatchedSkillIds: [] };
  }

  const skillRefs = Array.isArray(selected.skills)
    ? (selected.skills as Array<Record<string, unknown>>)
    : [];
  // Official skills resolve against the provider catalog at apply time; only
  // custom references map to synced skills-group declarations.
  const referencedIds = new Set(
    skillRefs
      .filter((skillRef) => skillRef.type !== "official")
      .map((skillRef) => skillRef.skill_id)
      .filter((skillId): skillId is string => typeof skillId === "string"),
  );
  const skills = (config.skills ?? {}) as Record<string, Record<string, unknown>>;
  const keptSkills = Object.keys(skills).filter((key) => referencedIds.has(key));
  const pendingIds = Array.from(referencedIds).filter((skillId) => !(skillId in skills));
  // Key misses: the ref carries a remote ID while the group key is a
  // display-name slug — resolve through the custom catalog before declaring
  // the reference unmatched.
  const { resolved, unmatched: unmatchedSkillIds } = await resolveSkillKeysByIds(
    runtime,
    SYNC_PROVIDER,
    skills,
    pendingIds,
  );
  for (const resolvedKey of resolved.values()) {
    if (!keptSkills.includes(resolvedKey)) keptSkills.push(resolvedKey);
  }
  if (keptSkills.length > 0) {
    config.skills = Object.fromEntries(keptSkills.map((key) => [key, skills[key]!]));
  } else {
    delete config.skills;
  }

  if (result.skillFiles) {
    const kept = new Set(keptSkills);
    for (const skillName of result.skillFiles.keys()) {
      if (!kept.has(skillName)) result.skillFiles.delete(skillName);
    }
  }
  if ("skill" in result.counts) result.counts.skill = keptSkills.length;

  return { keptSkills, unmatchedSkillIds };
}

/**
 * Drop file resources whose `source` does not exist locally — the remote
 * platform cannot hand file content back, so keeping them would make the
 * synced config un-appliable. Returns the removed YAML keys.
 */
function removeMissingFileSources(config: Record<string, unknown>, baseDir: string): string[] {
  const files = (config.files ?? {}) as Record<string, Record<string, unknown>>;
  const removed = Object.entries(files)
    .filter(
      ([, decl]) => typeof decl.source === "string" && !existsSync(join(baseDir, decl.source)),
    )
    .map(([key]) => key);
  for (const key of removed) {
    delete files[key];
  }
  if (Object.keys(files).length === 0) {
    delete config.files;
  }
  return removed;
}

/** Persist provider-downloaded skill files under ./skills/<name>/; returns the file count. */
async function writeDownloadedSkillFiles(
  result: SyncProjectResult,
  baseDir: string,
): Promise<number> {
  if (!result.skillFiles?.size) return 0;
  let written = 0;
  for (const [skillName, skillFileList] of result.skillFiles) {
    for (const skillFile of skillFileList) {
      const filePath = join(baseDir, "skills", skillName, skillFile.relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, skillFile.content);
      written++;
    }
  }
  return written;
}

/** Custom skills whose local source dir/file is absent or empty after sync. */
function collectMissingSkillSources(config: Record<string, unknown>, baseDir: string): string[] {
  const skills = (config.skills ?? {}) as Record<string, Record<string, unknown>>;
  const missing: string[] = [];
  for (const [key, decl] of Object.entries(skills)) {
    if (decl.origin !== "custom" || typeof decl.source !== "string") continue;
    const sourcePath = join(baseDir, decl.source);
    if (!existsSync(sourcePath)) {
      missing.push(key);
      continue;
    }
    const sourceStat = statSync(sourcePath);
    if (sourceStat.isDirectory() && readdirSync(sourcePath).length === 0) {
      missing.push(key);
    }
  }
  return missing;
}
