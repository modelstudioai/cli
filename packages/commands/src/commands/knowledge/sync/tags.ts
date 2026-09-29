import { createHash } from "node:crypto";
import type { SyncScope } from "./types.ts";

export function validSyncId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !/^[a-z]:/i.test(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

export function syncPathTag(relativePath: string): string {
  return `p${createHash("sha256").update(relativePath, "utf8").digest("hex").slice(0, 31)}`;
}

export function syncScopeTag(scope: SyncScope, syncId: string): string {
  const encoded = JSON.stringify([scope.endpointOrigin, scope.workspaceId, scope.indexId, syncId]);
  return `s${createHash("sha256").update(encoded, "utf8").digest("hex").slice(0, 31)}`;
}

export function syncTags(
  scope: SyncScope,
  syncId: string,
  relativePath: string,
  contentMd5: string,
): [string, string, string] {
  return [syncScopeTag(scope, syncId), syncPathTag(relativePath), contentMd5];
}

/** Distinguishes repeated uploads while retaining earlier data-center sources. */
export function syncOperationTag(operationId: string): string {
  return `v${createHash("sha256").update(operationId, "utf8").digest("hex").slice(0, 31)}`;
}
