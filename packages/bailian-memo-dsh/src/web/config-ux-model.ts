export const MEMO_SETTINGS_FIELDS = [
  { field: "enabled", kind: "toggle" },
  { field: "autoRecall", kind: "toggle" },
  { field: "autoCurate", kind: "toggle" },
  { field: "recallTopK", kind: "number" },
  { field: "minScore", kind: "score" },
] as const;

export type MemoryDisplayState =
  | "setupRequired"
  | "initializing"
  | "active"
  | "paused"
  | "automaticDisabled";

export interface MemoryStatusInput {
  status: string;
}

export function isWorkspaceEndpointAccessDenied(message: string | null | undefined): boolean {
  return Boolean(
    message?.includes("Endpoint.AccessDenied") &&
    message.includes("Workspace endpoint access denied."),
  );
}

/** Empty clears the field; other drafts must be a finite score from 0 to 1. */
export function parseScoreSetting(
  text: string,
): { kind: "clear" } | { kind: "set"; value: number } | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "clear" };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return undefined;
  return { kind: "set", value: parsed };
}

export function parseBooleanSetting(
  text: string,
): { kind: "clear" } | { kind: "set"; value: boolean } | undefined {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return { kind: "clear" };
  if (trimmed === "true" || trimmed === "1" || trimmed === "yes") {
    return { kind: "set", value: true };
  }
  if (trimmed === "false" || trimmed === "0" || trimmed === "no") {
    return { kind: "set", value: false };
  }
  return undefined;
}

export function projectMemoryDisplayState(
  personal: MemoryStatusInput | null,
  automaticEnabled: boolean,
): MemoryDisplayState {
  if (!personal || personal.status === "unconfigured") return "setupRequired";
  if (personal.status === "initializing") return "initializing";
  if (personal.status === "paused") return "paused";
  return automaticEnabled ? "active" : "automaticDisabled";
}
