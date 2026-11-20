import { observeRegistry } from "./update-check.ts";
import { existsSync, lstatSync, mkdtempSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  BailianError,
  ExitCode,
  fetchSkillsIndex,
  getSkillLockPath,
  getSkillRegistryBaseUrl,
  getSkillsDir,
  installationRoots,
  planUnlinkSkillFromAgents,
  readCatalogInstalls,
  readSkillLock,
  validateSkillDir,
  writeSkillLock,
  type CommandContext,
  type SkillLockEntry,
  type SkillsIndex,
} from "bailian-cli-core";
import { withStateLock } from "../shared/state-lock.ts";
import { cloudCatalog, cloudRevision, unpackRevision, type Revision } from "./packages.ts";
import {
  cachedPackage,
  cacheKey,
  commitTarget,
  fileDiff,
  releaseCache,
  saveCache,
} from "./managed-files.ts";
import {
  checkContent,
  checkProjectRoot,
  installTargets,
  otherSourcePaths,
  present,
  selectedEntries,
  selectedNames,
  skillSource,
  targetForEntry,
  validName,
  type Selection,
  type Target,
} from "./targets.ts";

import type { SkillAddPackages } from "./mcp-dependencies.ts";

type Action = "add" | "update" | "remove";
export function withSkillMutation<T>(
  ctx: Pick<CommandContext, "settings" | "localize">,
  run: () => Promise<T>,
) {
  return ctx.settings.dryRun ? run() : withStateLock(getSkillLockPath(), ctx.localize, run);
}
export function useTargetRecords(flags: Selection) {
  const names = selectedNames(flags);
  return !!(
    skillSource(flags) === "cloud" ||
    flags.scope ||
    flags.agent ||
    flags.skillVersion ||
    flags.diff ||
    selectedEntries(flags).some(
      ([, entry]) =>
        entry.installedPath ||
        (names !== "all" && !!entry.remoteId && names.includes(entry.remoteId)),
    )
  );
}
type Context = Pick<CommandContext, "client" | "localize" | "output" | "settings">;
interface Destination {
  target: Target;
  key?: string;
  entry?: SkillLockEntry;
  link?: boolean;
}
interface Result {
  code: string;
  status: "succeeded" | "noop" | "failed";
  reason: string;
  agent?: string | null;
  scope?: string;
  installed_path?: string;
  [key: string]: unknown;
}

function destinations(key: string, entry: SkillLockEntry, flags: Selection): Destination[] {
  const primary = targetForEntry(key, entry);
  const targets: Destination[] = [{ target: primary, key, entry }];
  if (!entry.installedPath) {
    const roots = installationRoots();
    for (const path of new Set([...(entry.links ?? []), ...planUnlinkSkillFromAgents(key)])) {
      const root = dirname(resolve(path));
      const target = roots.get(root);
      if (target?.agent && resolve(path) === join(root, key))
        targets.unshift({ target: { root, ...target }, key, entry, link: true });
    }
  }
  return targets.filter(
    ({ target }) => !flags.agent || flags.agent === "all" || target.agent === flags.agent,
  );
}

function verifyDestination(path: string, name: string, dest: Destination) {
  checkProjectRoot(dest.target);
  if (dest.link && lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
    const canonical = join(getSkillsDir(), name);
    if (resolve(dirname(path), readlinkSync(path)) === resolve(canonical))
      return checkContent(canonical, dest.entry);
    throw new BailianError(`MODIFIED_CONFLICT: ${path}`);
  }
  checkContent(path, dest.entry);
}

export async function runSkillLifecycle(
  action: Action,
  ctx: Context,
  flags: Selection,
  staged?: SkillAddPackages,
) {
  const lock = readSkillLock();
  const reservedPaths = otherSourcePaths(skillSource(flags), lock);
  const requested = selectedNames(flags);
  const results: Result[] = [];
  let firstError: Error | undefined;
  function failure(id: string, error: unknown, target?: Target) {
    const caught = error instanceof Error ? error : new Error(String(error));
    firstError ??= caught;
    const api = caught instanceof BailianError ? caught.api : undefined;
    results.push({
      code: id,
      status: "failed",
      reason: api?.apiCode ?? caught.message.split(":")[0]!,
      message: caught.message,
      error_code:
        api?.apiCode ?? (caught instanceof BailianError ? caught.exitCode : ExitCode.GENERAL),
      request_id: api?.requestId,
      http_status: api?.httpStatus,
      ...(target && { agent: target.agent, scope: target.scope }),
    });
  }
  let index: Promise<SkillsIndex> | undefined;
  const ossIndex = () =>
    (index ??= (staged?.ossIndex() ?? fetchSkillsIndex()).then((value) =>
      observeRegistry(ctx, value),
    ));
  const revisions = staged?.revisions ?? new Map<string, Promise<Revision>>();
  const packages =
    staged?.packages ?? new Map<string, Awaited<ReturnType<typeof unpackRevision>>>();
  const scratch: string[] = [];
  async function processSkill(
    id: string,
    source: "cloud" | "oss",
    targets: Destination[],
    pinned?: string,
  ) {
    if (!targets.length)
      throw new BailianError("NOT_INSTALLED: No matching target / 没有匹配的安装目标");
    const location = source === "cloud" ? ctx.client.baseUrl : getSkillRegistryBaseUrl();
    let revision: Revision | undefined;
    let artifact: Awaited<ReturnType<typeof unpackRevision>> | undefined;
    const known = targets[0]!.entry;
    if (action !== "remove") {
      if (known?.sourceLocation && known.sourceLocation !== location)
        throw new BailianError(
          "SOURCE_MISMATCH: Select the original gateway or registry / 请切换至原安装来源",
        );
      if (source === "cloud") {
        const versionKey = JSON.stringify([id, pinned]);
        const pending = revisions.get(versionKey) ?? cloudRevision(ctx, id, pinned);
        revisions.set(versionKey, pending);
        revision = await pending;
      } else {
        const entries = (await ossIndex()).skills;
        const entry = Object.hasOwn(entries, id) ? entries[id] : undefined;
        if (!entry && action === "update") {
          results.push({ code: id, status: "noop", reason: "DELISTED" });
          return;
        }
        if (!entry) throw new BailianError("Skill not found in registry / Registry 中未找到 Skill");
        if (pinned && pinned !== entry.version)
          throw new BailianError(
            "The OSS registry does not publish the requested version / OSS Registry 未提供指定版本",
          );
        revision = {
          source,
          id,
          version: entry.version,
          oss: entry,
          description: entry.description,
        };
      }
    }
    const revisionKey = cacheKey(
      location,
      id,
      revision?.oss?.contentHash ?? revision?.version ?? "",
    );
    async function loadPackage() {
      if (!packages.has(revisionKey)) {
        const cached = cachedPackage(revisionKey);
        const record = Object.values(lock.skills).find((entry) => entry.cacheKey === revisionKey);
        if (
          record?.contentHash &&
          existsSync(cached) &&
          (source === "cloud" || revision?.oss?.contentHash)
        ) {
          checkContent(cached, record);
          const meta = validateSkillDir(cached, id);
          packages.set(revisionKey, {
            root: cached,
            name: source === "cloud" ? meta.name : id,
            hash: record.contentHash,
          });
          return packages.get(revisionKey)!;
        }
        const temp = staged?.temp() ?? mkdtempSync(join(tmpdir(), "bl-skill-"));
        if (!staged) scratch.push(temp);
        packages.set(revisionKey, await unpackRevision(ctx, revision!, temp));
      }
      return packages.get(revisionKey)!;
    }
    // A legacy canonical directory backs all its symlinks. Validate them before changing it.
    if (known && !known.installedPath && targets.some((dest) => !dest.link)) {
      for (const dest of targets) {
        const name = dest.entry!.canonicalName ?? dest.key!;
        verifyDestination(join(dest.target.root, name), name, dest);
      }
    }
    for (const dest of targets) {
      try {
        let name = dest.entry?.canonicalName ?? (dest.entry ? dest.key! : id);
        if (!validName(name)) throw new BailianError("Invalid installation name / 安装名无效");
        // New cloud installs learn the canonical directory name from the verified archive.
        if (!dest.entry && source === "cloud" && (!ctx.settings.dryRun || staged)) {
          artifact = await loadPackage();
          name = artifact.name;
        }
        const path = join(dest.target.root, name);
        const targetKey =
          dest.key ?? `target:${cacheKey(dest.target.scope, dest.target.root, name)}`;
        const owned =
          dest.entry ??
          (Object.hasOwn(lock.skills, targetKey) ? lock.skills[targetKey] : undefined);
        const nameKnown = source !== "cloud" || !!owned || !!artifact;
        if (
          (nameKnown && reservedPaths.has(resolve(path))) ||
          (owned && (owned.sourceType === "openapi" ? "cloud" : "oss") !== source) ||
          (owned?.remoteId && source === "cloud" && owned.remoteId !== id) ||
          (action !== "remove" && owned?.sourceLocation && owned.sourceLocation !== location)
        )
          throw new BailianError(`SOURCE_CONFLICT: ${path}`);
        const details = {
          source,
          agent: dest.target.agent,
          scope: dest.target.scope,
          target_root: dest.target.root,
          installed_path: nameKnown ? path : undefined,
          locked_version: owned?.installedVersion ?? null,
          target_version: revision?.version ?? null,
        };
        if (nameKnown) verifyDestination(path, name, { ...dest, entry: owned });
        const unchanged =
          !!owned &&
          existsSync(join(path, "SKILL.md")) &&
          (source === "cloud"
            ? owned.installedVersion === revision?.version
            : !!revision?.oss?.contentHash && owned.contentHash === revision.oss.contentHash);
        const current =
          action !== "remove" && unchanged && (action !== "add" || pinned === owned?.pinnedVersion);
        if (staged) {
          if (!artifact && !(current && owned?.contentHash?.startsWith("sha256:")))
            artifact = await loadPackage();
          staged.inspect(id, artifact?.root ?? path, ctx.settings.dryRun);
        }
        let diff;
        if (flags.diff && revision) {
          const next = cachedPackage(revisionKey);
          if (!current && !ctx.settings.dryRun) artifact = await loadPackage();
          diff = current
            ? { added: [], removed: [], modified: [] }
            : artifact || existsSync(next)
              ? fileDiff(path, artifact?.root ?? next)
              : {
                  available: false,
                  download_required: true,
                  content_path: revision.versionPath
                    ? revision.versionPath + "/content"
                    : undefined,
                };
        }
        const reason =
          action === "remove"
            ? "REMOVED"
            : current
              ? action === "add"
                ? "ALREADY_INSTALLED"
                : "UP_TO_DATE"
              : action === "add"
                ? "INSTALLED"
                : "UPDATED";
        if (!current && !ctx.settings.dryRun) {
          let nextEntry: SkillLockEntry | undefined;
          if (revision) {
            artifact ??= await loadPackage();
            // Keep the established install path if a newer manifest renames itself.
            saveCache(revisionKey, artifact.root);
            nextEntry = {
              sourceType: source === "cloud" ? "openapi" : "oss",
              sourceLocation: location,
              remoteId: source === "cloud" ? id : revision.oss?.remoteId,
              canonicalName: name,
              installedVersion: revision.version,
              pinnedVersion: pinned,
              contentHash: artifact.hash,
              cacheKey: revisionKey,
              description: revision.description,
              publishedAt: revision.oss?.publishedAt,
              installedAt: new Date().toISOString(),
              agent: dest.target.agent ?? undefined,
              scope: dest.target.scope,
              projectRoot: dest.target.scope === "project" ? process.cwd() : undefined,
              installedPath: path,
            };
          }
          const commit = () => {
            const skills = { ...lock.skills };
            if (dest.link) {
              const parent = skills[targetKey]!;
              skills[targetKey] = {
                ...parent,
                links: parent.links?.filter((link) => resolve(link) !== path),
              };
              if (nextEntry)
                skills[`target:${cacheKey(dest.target.scope, dest.target.root, name)}`] = nextEntry;
            } else if (nextEntry) skills[targetKey] = nextEntry;
            else delete skills[targetKey];
            writeSkillLock({ version: 1, skills });
            lock.skills = skills;
          };
          try {
            // A user may have edited the destination while the download was in flight.
            verifyDestination(path, name, { ...dest, entry: owned });
            if (action === "remove" && !present(path)) commit();
            else commitTarget(path, nextEntry ? artifact!.root : undefined, commit);
          } catch (error) {
            releaseCache(nextEntry?.cacheKey, lock);
            throw error;
          }
          releaseCache(owned?.cacheKey, lock);
        }
        results.push({
          code: id,
          status: current ? "noop" : "succeeded",
          reason,
          ...details,
          ...(diff && { diff }),
        });
      } catch (error) {
        failure(id, error, dest.target);
        if (dest.link) break;
      }
    }
  }
  try {
    const entries = selectedEntries(flags, lock);
    if (action === "add") {
      const source = skillSource(flags);
      const names =
        requested === "all"
          ? source === "cloud"
            ? [...(await (staged?.cloudCatalog(ctx) ?? cloudCatalog(ctx))).keys()]
            : Object.keys((await ossIndex()).skills)
          : requested;
      const targets = installTargets(flags);
      for (const name of names) {
        try {
          const ids =
            source === "cloud"
              ? readCatalogInstalls(ctx.client.baseUrl, "openapi", lock).resolveIds(name)
              : [name];
          if (ids.length !== 1)
            throw new BailianError("Ambiguous installation name / 安装名不唯一");
          const id = ids[0]!;
          const existing = Object.entries(lock.skills).filter(
            ([key, entry]) =>
              (entry.sourceType === "openapi" ? "cloud" : "oss") === source &&
              (source === "cloud"
                ? entry.remoteId === id
                : (entry.canonicalName ?? key) === name) &&
              (!entry.projectRoot || entry.projectRoot === process.cwd()),
          );
          const locations = existing.flatMap(([key, entry]) => destinations(key, entry, flags));
          await processSkill(
            id,
            source,
            targets.map(
              (target) => locations.find((dest) => dest.target.root === target.root) ?? { target },
            ),
            flags.skillVersion,
          );
        } catch (error) {
          failure(name, error);
        }
      }
    } else {
      for (const [key, entry] of entries) {
        const id = entry.sourceType === "openapi" ? entry.remoteId! : (entry.canonicalName ?? key);
        try {
          await processSkill(
            id,
            entry.sourceType === "openapi" ? "cloud" : "oss",
            destinations(key, entry, flags),
            entry.pinnedVersion,
          );
        } catch (error) {
          failure(id, error);
        }
      }
      if (requested !== "all")
        for (const name of requested) {
          if (
            !entries.some(
              ([key, entry]) => name === (entry.canonicalName ?? key) || name === entry.remoteId,
            )
          )
            failure(name, new BailianError("NOT_INSTALLED: Skill not installed / Skill 未安装"));
        }
    }
  } finally {
    for (const temp of scratch) rmSync(temp, { recursive: true, force: true });
  }
  const summary = { succeeded: 0, failed: 0, noop: 0 };
  for (const row of results) summary[row.status]++;
  return {
    data: {
      action: `skill.${action}`,
      dry_run: ctx.settings.dryRun,
      summary,
      results,
      skills: results.map((row) => ({ ...row, name: row.code })),
    },
    firstError,
  };
}
