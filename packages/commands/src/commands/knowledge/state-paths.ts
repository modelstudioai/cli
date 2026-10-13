import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";

/** Tuple hashing keeps arbitrary names safe and distinct on case-insensitive filesystems. */
function stateKey(identifiers: string[]): string {
  return createHash("sha256").update(JSON.stringify(identifiers)).digest("hex");
}

export function defaultInitStatePath(workspaceId: string, name: string): string {
  return resolve(
    homedir(),
    ".bailian",
    "knowledge",
    "init",
    `${stateKey([workspaceId, name])}.json`,
  );
}

export function defaultSyncStatePath(directory: string, indexId: string): string {
  return resolve(directory, ".bailian", "sync", `${stateKey([indexId])}.json`);
}
