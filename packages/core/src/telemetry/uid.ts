import { randomBytes, randomUUID } from "crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "fs";
import { join } from "path";
import { getConfigDir } from "../config/paths.ts";

/** On-disk name for the anonymous install id reported to AEM as `uid`. */
export const UID_FILE_NAME = "telemetry-uid";

/** Exclusive mkdir lock; mirrors aliyun-cli's telemetry-instance-id.lock role. */
export const UID_LOCK_NAME = "telemetry-uid.lock";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * How long a waiter may block for the publish lock.
 * initRemote runs once per process, so we briefly wait instead of giving up
 * immediately (aliyun-cli can retry EnsureInstanceID on the next event).
 */
const LOCK_WAIT_MS = 1000;

/**
 * Reclaim a lock dir left behind by a crashed holder (aliyun flock auto-releases; mkdir does not).
 * Assumes the holder has crashed. Extreme stalls past this age may reclaim a live lock;
 * unlock still only removes the dir when this process still owns the owner token.
 */
const LOCK_STALE_MS = 2000;

type ReadResult =
  | { kind: "ok"; id: string }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "unreadable" };

export function getUidPath(): string {
  return join(getConfigDir(), UID_FILE_NAME);
}

export function getUidLockPath(): string {
  return join(getConfigDir(), UID_LOCK_NAME);
}

function readUidFile(path: string): ReadResult {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "missing" }
      : { kind: "unreadable" };
  }
  const id = raw.trim().toLowerCase();
  return UUID_V4.test(id) ? { kind: "ok", id } : { kind: "invalid" };
}

/** Read-only: returns undefined when missing or invalid; never creates the file. */
export function loadUid(): string | undefined {
  const result = readUidFile(getUidPath());
  return result.kind === "ok" ? result.id : undefined;
}

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

/**
 * Claim a stale lock by renaming it away (only one reclaimer wins), then delete the claim.
 * Never rmSync the live lock path by name — that can delete a newer holder's mkdir.
 */
function tryReclaimStaleLock(lockPath: string): void {
  try {
    const age = Date.now() - statSync(lockPath).mtimeMs;
    if (age <= LOCK_STALE_MS) return;
    const stalePath = `${lockPath}.stale.${randomBytes(6).toString("hex")}`;
    try {
      renameSync(lockPath, stalePath);
    } catch {
      return; // another process already claimed or removed it
    }
    try {
      rmSync(stalePath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

/**
 * Acquire an exclusive mkdir lock, waiting up to timeoutMs.
 * Returns an unlock function, or undefined when the lock stays busy.
 * unlock only removes the lock when this process still owns the owner token.
 */
function acquireUidLock(timeoutMs: number): (() => void) | undefined {
  const lockPath = getUidLockPath();
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      mkdirSync(lockPath);
      const token = randomBytes(8).toString("hex");
      try {
        writeFileSync(join(lockPath, "owner"), `${token}\n`, { flag: "wx", mode: 0o600 });
      } catch (error) {
        try {
          rmSync(lockPath, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        throw error;
      }
      return () => {
        // Rename the owner file first so we only delete a lock we still own.
        try {
          renameSync(join(lockPath, "owner"), join(lockPath, `releasing.${token}`));
          rmSync(lockPath, { recursive: true, force: true });
        } catch {
          /* lock moved/stolen or already gone */
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (code !== "EEXIST") throw error;

      tryReclaimStaleLock(lockPath);

      if (Date.now() >= deadline) return undefined;
      sleepSync(Math.min(5, Math.max(0, deadline - Date.now())));
    }
  }
}

/** Same-directory temp + rename publish (aliyun atomicWriteFile). */
function publishUid(path: string, id: string): void {
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const fd = openSync(tmp, "wx", 0o600);
    try {
      writeSync(fd, `${id}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* rename removed tmp; ignore ENOENT */
    }
  }
}

/**
 * Read or create the persistent anonymous install id (AEM `uid`).
 *
 * Must stay synchronous: remoteSink relies on no await between the call and
 * event enqueue, otherwise flushTelemetry may return before the event is queued.
 *
 * Concurrency follows aliyun-cli EnsureInstanceID: steady-state is lock-free read;
 * create/repair takes an exclusive lock, re-reads under the lock, then publishes
 * with temp+rename. Lock wait is bounded (LOCK_WAIT_MS); on timeout we loadUid or
 * omit `uid` so telemetry never blocks the business exit path indefinitely.
 * Any failure returns undefined so remoteSink omits `uid`; built-in Tracker
 * `device_id` is unchanged.
 */
export function ensureUid(): string | undefined {
  const path = getUidPath();
  const current = readUidFile(path);
  if (current.kind === "ok") return current.id;
  // Do not overwrite unreadable paths (e.g. permission errors); that could damage the environment.
  if (current.kind === "unreadable") return undefined;

  let unlock: (() => void) | undefined;
  try {
    mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
    unlock = acquireUidLock(LOCK_WAIT_MS);
    if (!unlock) {
      // Another process held the lock past our wait; use whatever it published.
      return loadUid();
    }

    // Another process may have finished between our first read and lock acquire.
    const again = readUidFile(path);
    if (again.kind === "ok") return again.id;
    if (again.kind === "unreadable") return undefined;

    const id = randomUUID();
    publishUid(path, id);
    return id;
  } catch {
    // Read-only FS, disk full, etc.: stay silent and try reading once more.
    return loadUid();
  } finally {
    unlock?.();
  }
}
