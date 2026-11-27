import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { getSkillsDir, type SkillLockFile } from "bailian-cli-core";
import { present } from "./targets.ts";

/** Stage each path on its own filesystem and keep every original until the ledger is committed. */
export function commitTargets(targets: { path: string; source?: string }[], commit: () => void) {
  const transactions: { path: string; directory: string; backup: string; promoted: boolean }[] = [];
  try {
    for (const { path, source } of targets) {
      if (!source && !present(path)) continue;
      mkdirSync(dirname(path), { recursive: true });
      const directory = mkdtempSync(join(dirname(path), ".skill-txn-"));
      const backup = join(directory, "original");
      const staged = join(directory, "next");
      const transaction = { path, directory, backup, promoted: false };
      transactions.push(transaction);
      if (source) cpSync(source, staged, { recursive: true, errorOnExist: true, force: false });
      if (present(path)) renameSync(path, backup);
      if (source) {
        renameSync(staged, path);
        transaction.promoted = true;
      }
    }
    commit();
  } catch (error) {
    const errors: unknown[] = [];
    for (const { path, directory, backup, promoted } of transactions.reverse()) {
      try {
        if (promoted) rmSync(path, { recursive: true, force: true });
        if (present(backup)) renameSync(backup, path);
        rmSync(directory, { recursive: true, force: true });
      } catch (restoreError) {
        // Keep the backup for recovery and continue restoring the other paths.
        errors.push(restoreError);
      }
    }
    if (errors.length) throw new AggregateError([error, ...errors], String(error));
    throw error;
  }
  for (const { directory } of transactions) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // A host may hold the backup open. The lock and active paths are already committed.
    }
  }
}

export function commitTarget(path: string, source: string | undefined, commit: () => void) {
  commitTargets([{ path, source }], commit);
}

export function cacheKey(source: string, id: string, revision: string) {
  return createHash("sha256")
    .update(JSON.stringify([source, id, revision]))
    .digest("hex");
}
export function cachedPackage(key: string) {
  return join(getSkillsDir(), ".packages", key);
}
export function saveCache(key: string, root: string) {
  const path = cachedPackage(key);
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  const temp = mkdtempSync(join(dirname(path), ".incoming-"));
  try {
    cpSync(root, join(temp, "package"), { recursive: true });
    renameSync(join(temp, "package"), path);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export function releaseCache(key: string | undefined, lock: SkillLockFile) {
  if (
    key &&
    /^[0-9a-f]{64}$/.test(key) &&
    !Object.values(lock.skills).some((entry) => entry.cacheKey === key)
  )
    rmSync(cachedPackage(key), { recursive: true, force: true });
}

export function fileDiff(current: string, next: string) {
  function files(root: string) {
    const hashes = new Map<string, string>();
    function visit(relative: string) {
      for (const item of readdirSync(join(root, relative), { withFileTypes: true })) {
        const path = join(relative, item.name);
        if (item.isDirectory()) visit(path);
        else if (item.isFile())
          hashes.set(
            path,
            createHash("sha256")
              .update(readFileSync(join(root, path)))
              .digest("hex"),
          );
      }
    }
    if (lstatSync(root, { throwIfNoEntry: false })?.isDirectory()) visit("");
    return hashes;
  }
  const before = files(current),
    after = files(next);
  return {
    added: [...after.keys()].filter((path) => !before.has(path)).sort(),
    removed: [...before.keys()].filter((path) => !after.has(path)).sort(),
    modified: [...after.keys()]
      .filter((path) => before.has(path) && before.get(path) !== after.get(path))
      .sort(),
  };
}
