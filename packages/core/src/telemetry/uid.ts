import { randomBytes, randomUUID } from "crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { getConfigDir } from "../config/paths.ts";

/** On-disk name for the anonymous install id reported to AEM as `uid`. */
export const UID_FILE_NAME = "telemetry-uid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

/** Same-directory temp + rename publish (atomic content swap; may overwrite). */
function publishUid(path: string, id: string): void {
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const fd = openSync(tmp, "wx", 0o600);
    try {
      // writeFileSync(fd) loops until the full buffer is written; writeSync can short-write.
      writeFileSync(fd, `${id}\n`);
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
 * Lock-free like qwen-code InstallationManager: steady-state is a plain read;
 * missing/invalid content is published with temp+rename (last writer wins under
 * concurrent first runs). Any failure returns undefined so remoteSink omits
 * `uid`; built-in Tracker `device_id` is unchanged.
 */
export function ensureUid(): string | undefined {
  const path = getUidPath();
  const current = readUidFile(path);
  if (current.kind === "ok") return current.id;
  // Do not overwrite unreadable paths (permission errors, a directory in the way).
  if (current.kind === "unreadable") return undefined;

  try {
    mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
    const id = randomUUID();
    publishUid(path, id);
    return id;
  } catch {
    // Read-only FS, disk full, etc.: stay silent and try reading once more.
    return loadUid();
  }
}
