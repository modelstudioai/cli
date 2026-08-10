import {
  listCloudEnvironments,
  listCloudVaults,
  listFiles,
  listSkills,
  type ProjectRuntimeContext,
  type SyncProjectResult,
} from "@openagentpack/sdk";
import { BailianError, ExitCode } from "bailian-cli-core";

/** Resource types the SDK can reverse-export (its syncable whitelist). */
export const SYNCABLE_TYPES = ["environment", "vault", "file", "skill", "agent"] as const;

export type SyncableType = (typeof SYNCABLE_TYPES)[number];

/**
 * Types selectable by remote ID through the shared resolution below. Agents are
 * excluded: their synced yaml keys ARE remote IDs, so the sync command narrows
 * them with a direct key hit (plus referenced-skill handling) instead.
 */
export type SelectableResourceType = Exclude<SyncableType, "agent">;

/** Maps a syncable type to its top-level group key in the synced config. */
const GROUP_KEY: Record<SyncableType, string> = {
  environment: "environments",
  vault: "vaults",
  file: "files",
  skill: "skills",
  agent: "agents",
};

/** Remote id lookup outcome: human label + optional `agents.resource` yaml key tag. */
interface LocatedRemote {
  label?: string;
  taggedKey?: string;
}

/**
 * Narrow one resource group of a synced config to the single entry identified
 * by its remote ID; returns the kept yaml key.
 *
 * Group keys are only guaranteed to be remote IDs for agents; the other types
 * derive their key from the `agents.resource` metadata tag or a display-name
 * slug. Resolution therefore tries, in order: direct key hit → remote lookup
 * by ID (provider list API) → metadata-tag key → label match against the
 * exported declarations. Misses and ambiguity fail loudly instead of guessing.
 */
export async function narrowGroupToRemoteId(
  runtime: ProjectRuntimeContext,
  provider: string,
  result: SyncProjectResult,
  type: SelectableResourceType,
  remoteId: string,
): Promise<string> {
  const groupKey = GROUP_KEY[type];
  const group = (result.config[groupKey] ?? {}) as Record<string, Record<string, unknown>>;

  let keptKey: string;
  if (remoteId in group) {
    keptKey = remoteId;
  } else {
    const located = await locateRemote(runtime, provider, type, remoteId);
    const resolved =
      located.taggedKey && located.taggedKey in group
        ? located.taggedKey
        : matchByLabel(type, group, located.label);
    if (!resolved) {
      throw new BailianError(
        `Remote ${type} '${remoteId}'${located.label ? ` (${located.label})` : ""} has no matching entry in the synced output.`,
        ExitCode.GENERAL,
        "The resource may be archived or renamed; run a full sync (without the id flag) to inspect the exported keys.",
      );
    }
    keptKey = resolved;
  }

  result.config[groupKey] = { [keptKey]: group[keptKey]! };
  if (type in result.counts) result.counts[type] = 1;
  if (type === "skill" && result.skillFiles) {
    for (const skillName of result.skillFiles.keys()) {
      if (skillName !== keptKey) result.skillFiles.delete(skillName);
    }
  }
  return keptKey;
}

/** Look a remote resource up by ID via the provider's list API. */
async function locateRemote(
  runtime: ProjectRuntimeContext,
  provider: string,
  type: SelectableResourceType,
  remoteId: string,
): Promise<LocatedRemote> {
  if (type === "environment") {
    const environments = await listCloudEnvironments(runtime, { provider });
    const hit = environments.find((environment) => environment.id === remoteId);
    if (!hit) {
      throw notFound(
        type,
        remoteId,
        environments.map((environment) => formatCandidate(environment.id, environment.name)),
      );
    }
    return { label: hit.name, taggedKey: hit.metadata?.["agents.resource"] };
  }
  if (type === "vault") {
    const vaults = await listCloudVaults(runtime, { provider });
    const hit = vaults.find((vault) => vault.id === remoteId);
    if (!hit) {
      throw notFound(
        type,
        remoteId,
        vaults.map((vault) => formatCandidate(vault.id, vault.display_name)),
      );
    }
    return { label: hit.display_name, taggedKey: hit.metadata?.["agents.resource"] };
  }
  if (type === "file") {
    const files = await listFiles(runtime, { provider });
    const hit = files.find((fileInfo) => fileInfo.id === remoteId);
    if (!hit) {
      throw notFound(
        type,
        remoteId,
        files.map((fileInfo) => formatCandidate(fileInfo.id, fileInfo.filename)),
      );
    }
    return { label: hit.filename };
  }
  // Synced skills come from the workspace's custom catalog (the raw /skills listing).
  const skills = await listSkills(runtime, { provider, source: "custom" });
  const hit = skills.find((skill) => skill.id === remoteId);
  if (!hit) {
    throw notFound(
      type,
      remoteId,
      skills.map((skill) => formatCandidate(skill.id, skill.name)),
    );
  }
  return { label: hit.name };
}

/**
 * Batch-resolve remote skill IDs to synced skills-group keys via the custom
 * skill catalog: look each ID up for its display name, then match group keys
 * on normalized label (skills keys are display-name slugs). IDs that cannot be
 * resolved — or whose label matches more than one key — come back as
 * unmatched for the caller to surface. One catalog call serves the whole batch.
 */
export async function resolveSkillKeysByIds(
  runtime: ProjectRuntimeContext,
  provider: string,
  group: Record<string, Record<string, unknown>>,
  remoteIds: string[],
): Promise<{ resolved: Map<string, string>; unmatched: string[] }> {
  const resolved = new Map<string, string>();
  const unmatched: string[] = [];
  if (remoteIds.length === 0) return { resolved, unmatched };

  const catalog = await listSkills(runtime, { provider, source: "custom" });
  for (const remoteId of remoteIds) {
    const hit = catalog.find((skill) => skill.id === remoteId);
    const matches = hit
      ? Object.keys(group).filter((key) => normalizeLabel(key) === normalizeLabel(hit.name))
      : [];
    if (matches.length === 1) {
      resolved.set(remoteId, matches[0]!);
    } else {
      unmatched.push(remoteId);
    }
  }
  return { resolved, unmatched };
}

/**
 * Match a group entry by the remote resource's human label. Vaults and files
 * carry the label verbatim in their exported decl; environment and skill keys
 * are display-name slugs, so those compare on normalized alphanumerics.
 */
function matchByLabel(
  type: SelectableResourceType,
  group: Record<string, Record<string, unknown>>,
  label: string | undefined,
): string | undefined {
  if (!label) return undefined;
  const matches = Object.entries(group).filter(([key, decl]) => {
    if (type === "vault") return decl.display_name === label;
    if (type === "file") return decl.name === label || decl.source === label;
    return normalizeLabel(key) === normalizeLabel(label);
  });
  if (matches.length > 1) {
    throw new BailianError(
      `Multiple synced ${type} entries match '${label}': ${matches.map(([key]) => key).join(", ")}.`,
      ExitCode.GENERAL,
      "Run a full sync (without the id flag) and narrow the output manually.",
    );
  }
  return matches[0]?.[0];
}

/** Compare display labels and slug-derived keys on lowercase alphanumerics only. */
function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function notFound(type: string, remoteId: string, candidates: string[]): BailianError {
  const shown = candidates.slice(0, 20);
  const suffix =
    candidates.length > shown.length ? `, … ${candidates.length - shown.length} more` : "";
  return new BailianError(
    `${type} '${remoteId}' not found on the remote workspace.`,
    ExitCode.USAGE,
    candidates.length > 0
      ? `Available: ${shown.join(", ")}${suffix}.`
      : `The workspace has no syncable ${type} resources.`,
  );
}

function formatCandidate(id: string, label?: string): string {
  return label && label !== id ? `${id} (${label})` : id;
}
