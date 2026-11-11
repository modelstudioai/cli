import { randomBytes, randomUUID } from "crypto";
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "fs";
import { join } from "path";
import { getConfigDir } from "../config/paths.ts";

/** On-disk name for the anonymous install id reported to AEM as `uid`. */
export const UID_FILE_NAME = "telemetry-uid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Errnos where hard links are unavailable; fall back to rename. */
const NO_HARDLINK = new Set(["EPERM", "ENOTSUP", "ENOSYS", "EXDEV", "EOPNOTSUPP"]);

type ReadResult =
  | { kind: "ok"; id: string }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "unreadable" };

export function getUidPath(): string {
  return join(getConfigDir(), UID_FILE_NAME);
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

/**
 * Read or create the persistent anonymous install id (AEM `uid`).
 *
 * Must stay synchronous: remoteSink relies on no await between the call and
 * event enqueue, otherwise flushTelemetry may return before the event is queued.
 * Any failure returns undefined so remoteSink omits `uid`; built-in `device_id` is unchanged.
 */
export function ensureUid(): string | undefined {
  const path = getUidPath();
  const current = readUidFile(path);
  if (current.kind === "ok") return current.id;
  // Do not overwrite unreadable paths (e.g. permission errors); that could damage the environment.
  if (current.kind === "unreadable") return undefined;

  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
    const fd = openSync(tmp, "wx", 0o600);
    try {
      writeSync(fd, `${randomUUID()}\n`);
    } finally {
      closeSync(fd);
    }
    if (current.kind === "missing") {
      publishIfAbsent(tmp, path);
    } else {
      renameSync(tmp, path); // invalid: atomic replace
    }
  } catch {
    // Read-only FS, disk full, etc.: stay silent and try reading once more below.
  } finally {
    try {
      unlinkSync(tmp); // tmp remains after a successful link; rename removes it (ENOENT ok)
    } catch {
      /* ignore */
    }
  }

  return loadUid();
}

/** Atomic create-if-absent: first writer wins on concurrent first runs. */
function publishIfAbsent(tmp: string, path: string): void {
  try {
    linkSync(tmp, path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code === "EEXIST") return; // another process published first; keep theirs
    if (NO_HARDLINK.has(code)) {
      renameSync(tmp, path); // no hard links: last writer wins
      return;
    }
    throw error;
  }
}
