import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { getAgentTargets } from "./agents.ts";
import { getSkillsDir, readSkillLock } from "./lock.ts";
import { isSafeSkillName } from "./sanitize.ts";
import type { SkillLockEntry, SkillStatus } from "./types.ts";

type Scope = "user" | "project";
interface SkillLocation {
  agent: string | null;
  scope: Scope;
  installed_path: string;
  locked_version: string | null;
  install_state: SkillStatus;
}

function hasSkillManifest(path: string): boolean {
  try {
    return statSync(join(path, "SKILL.md"), { throwIfNoEntry: false })?.isFile() ?? false;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? ""))
      return false;
    throw error;
  }
}

export function installationRoots(project = process.cwd(), canonical = resolve(getSkillsDir())) {
  const roots = new Map<string, { agent: string | null; scope: Scope }>();
  roots.set(canonical, { agent: null, scope: "user" });
  for (const target of getAgentTargets()) {
    roots.set(resolve(target.skillsDir), { agent: target.id, scope: "user" });
  }
  // These agents also have a native skills directory relative to the project.
  for (const [agent, directory] of Object.entries({
    universal: ".agents",
    "claude-code": ".claude",
    cursor: ".cursor",
    "qwen-code": ".qwen",
    "gemini-cli": ".gemini",
    pi: ".pi",
    trae: ".trae",
    opencode: ".opencode",
  })) {
    const root = join(project, directory, "skills");
    if (!roots.has(root)) roots.set(root, { agent, scope: "project" });
  }
  return roots;
}

/** One read-only snapshot of the lock and skill roots, shared by all hits in a search. */
export function readCatalogInstalls(
  baseUrl: string,
  source?: SkillLockEntry["sourceType"],
  lock = readSkillLock(),
) {
  const project = process.cwd();
  const canonical = resolve(getSkillsDir());
  const roots = installationRoots(project, canonical);
  const existingRoots = [...roots].filter(([root]) => existsSync(root));
  const records = new Map<string, { name: string; entry: SkillLockEntry; paths: string[] }[]>();
  const claimedPaths = new Set<string>();
  const idsByName = new Map<string, Set<string>>();
  for (const [key, entry] of Object.entries(lock.skills)) {
    if (!entry || typeof entry !== "object") continue;
    const name = entry.canonicalName ?? key;
    const id = entry.remoteId ?? name;
    if (
      typeof name !== "string" ||
      !isSafeSkillName(name) ||
      name.includes("\0") ||
      typeof id !== "string"
    )
      continue;
    const primary = entry.installedPath ?? join(canonical, name);
    if (typeof primary !== "string" || !isAbsolute(primary)) continue;
    const paths = [primary, ...(Array.isArray(entry.links) ? entry.links : [])]
      .filter((path) => typeof path === "string" && isAbsolute(path))
      .map((path) => resolve(path));
    for (const path of paths) claimedPaths.add(path);
    if (source && (entry.sourceType ?? "oss") !== source) continue;
    if (entry.scope === "project" && entry.projectRoot && resolve(entry.projectRoot) !== project)
      continue;
    if (
      entry.sourceType === "openapi" &&
      entry.sourceLocation &&
      entry.sourceLocation.replace(/\/+$/, "") !== baseUrl.replace(/\/+$/, "")
    )
      continue;
    const entries = records.get(id) ?? [];
    entries.push({ name, entry, paths });
    records.set(id, entries);
    const ids = idsByName.get(name) ?? new Set();
    ids.add(id);
    idsByName.set(name, ids);
  }

  function inspect(id: string, latestVersion: string | null, canonicalName?: string) {
    const locations = new Map<string, SkillLocation>();
    const names = new Set<string>();
    if (canonicalName) names.add(canonicalName);
    if (!idsByName.has(id) || idsByName.get(id)?.has(id)) names.add(id);
    for (const { name, entry, paths } of records.get(id) ?? []) {
      names.add(name);
      for (const path of paths) {
        const root = roots.get(dirname(path));
        const lockedVersion = entry.installedVersion ?? null;
        const state = !hasSkillManifest(path)
          ? "missing"
          : lockedVersion && latestVersion && lockedVersion !== latestVersion
            ? "outdated"
            : "installed";
        locations.set(path, {
          installed_path: path,
          agent: (path === paths[0] ? entry.agent : undefined) ?? root?.agent ?? null,
          scope: (path === paths[0] ? entry.scope : undefined) ?? root?.scope ?? "user",
          locked_version: lockedVersion,
          install_state: state,
        });
      }
    }
    for (const name of names) {
      if (!isSafeSkillName(name) || name.includes("\0")) continue;
      for (const [root, target] of existingRoots) {
        const path = join(root, name);
        if (!claimedPaths.has(path) && hasSkillManifest(path)) {
          locations.set(path, {
            ...target,
            installed_path: path,
            locked_version: null,
            install_state: "untracked",
          });
        }
      }
    }
    const installations = [...locations.values()];
    const states = new Set(installations.map((location) => location.install_state));
    const priority: SkillStatus[] = ["outdated", "installed", "untracked", "missing"];
    const installState = priority.find((state) => states.has(state)) ?? "not-installed";
    const versions = new Set(
      installations
        .filter((location) => location.install_state !== "untracked")
        .map((location) => location.locked_version),
    );
    return {
      installed: installations.some((location) => location.install_state !== "missing"),
      install_state: installState,
      locked_version: versions.size === 1 ? ([...versions][0] ?? null) : null,
      installations,
    };
  }
  return {
    claimedPaths,
    resolveIds(name: string): string[] {
      return records.has(name) ? [name] : [...(idsByName.get(name) ?? [name])];
    },
    inspect,
  };
}
