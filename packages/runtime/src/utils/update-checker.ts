import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { getConfigDir, trackingHeaders } from "bailian-cli-core";

export const NPM_REGISTRY = "https://registry.npmjs.org";
/** Default npm package; products override per-call via the `npmPackage` argument. */
export const NPM_PACKAGE = "bailian-cli";

const STATE_FILE = () => join(getConfigDir(), "update-state.json");
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h
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
  // Skip in CI / non-TTY environments
  if (process.env.CI || !process.stderr.isTTY) return;

  const state = readState();
  const now = Date.now();

  // Throttle: skip if checked within the last 4 hours
  if (state && now - state.lastChecked < CHECK_INTERVAL_MS) {
    if (state.latestVersion && isNewerVersion(state.latestVersion, currentVersion)) {
      pendingNotification = state.latestVersion;
    }
    return;
  }

  const latest = await fetchLatestVersion(FETCH_TIMEOUT_MS, npmPackage);
  if (!latest) return;

  writeState({ lastChecked: now, latestVersion: latest });

  if (latest && isNewerVersion(latest, currentVersion)) {
    pendingNotification = latest;
  }
}
