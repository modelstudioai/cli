import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { getConfigDir, trackingHeaders } from "bailian-cli-core";

export const NPM_REGISTRY = "https://registry.npmjs.org";
/** Default npm package; products override per-call via the `npmPackage` argument. */
export const NPM_PACKAGE = "bailian-cli";

const STATE_FILE = () => join(getConfigDir(), "update-state.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 3000;

/**
 * Simple semver comparison: returns true if a > b.
 * Supports standard x.y.z format.
 */
function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false; // equal
}

interface UpdateState {
  lastChecked: number;
  latestVersion: string;
}

function readState(): UpdateState | null {
  try {
    const raw = readFileSync(STATE_FILE(), "utf-8");
    return JSON.parse(raw) as UpdateState;
  } catch {
    return null;
  }
}

function writeState(state: UpdateState): void {
  try {
    writeFileSync(STATE_FILE(), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export async function fetchLatestVersion(
  timeoutMs: number = FETCH_TIMEOUT_MS,
  npmPackage: string = NPM_PACKAGE,
): Promise<string | null> {
  try {
    const encoded = npmPackage.replace("/", "%2f");
    const res = await fetch(`${NPM_REGISTRY}/${encoded}/latest`, {
      headers: {
        Accept: "application/json",
        ...trackingHeaders(),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

let pendingNotification: string | null = null;

export function getPendingUpdateNotification(): string | null {
  return pendingNotification;
}

export async function checkForUpdate(
  currentVersion: string,
  npmPackage: string = NPM_PACKAGE,
): Promise<void> {
  const state = readState();
  const now = Date.now();

  // Inside the throttle window (CHECK_INTERVAL_MS since the last fetch): no
  // network call and no notice. The state file is global, so the notice fires at
  // most once per window across all processes/sessions — not once per command.
  if (state && now - state.lastChecked < CHECK_INTERVAL_MS) return;

  const latest = await fetchLatestVersion(FETCH_TIMEOUT_MS, npmPackage);
  if (!latest) return;

  writeState({ lastChecked: now, latestVersion: latest });

  if (latest && isNewerVersion(latest, currentVersion)) {
    pendingNotification = latest;
  }
}
