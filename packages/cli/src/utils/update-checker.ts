import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { getConfigDir, trackingHeaders } from "bailian-cli-core";

export const NPM_REGISTRY = "https://registry.npmjs.org";
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
): Promise<string | null> {
  try {
    const encoded = NPM_PACKAGE.replace("/", "%2f");
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

/**
 * Determines if the version gap is large enough to warrant auto-update.
 * Conditions (either triggers auto-update):
 * 1. New major > current major
 * 2. Same major, but new minor - current minor > 3
 */
export function isMajorUpgrade(latest: string, current: string): boolean {
  const [latestMajor, latestMinor] = latest.split(".").map(Number);
  const [currentMajor, currentMinor] = current.split(".").map(Number);

  // Condition 1: major version bump
  if (latestMajor > currentMajor) return true;

  // Condition 2: same major, minor gap > 3
  if (latestMajor === currentMajor && latestMinor - currentMinor > 3) return true;

  return false;
}

/**
 * Perform auto-update: install latest version globally and update agent skill.
 * Returns true if update succeeded, false otherwise.
 */
export async function performAutoUpdate(
  currentVersion: string,
  latestVersion: string,
): Promise<boolean> {
  const isTTY = process.stderr.isTTY;
  const green = isTTY ? "\x1b[32m" : "";
  const yellow = isTTY ? "\x1b[33m" : "";
  const cyan = isTTY ? "\x1b[36m" : "";
  const dim = isTTY ? "\x1b[2m" : "";
  const reset = isTTY ? "\x1b[0m" : "";

  const [latestMajor] = latestVersion.split(".").map(Number);
  const [currentMajor] = currentVersion.split(".").map(Number);
  const isMajorBump = latestMajor > currentMajor;

  process.stderr.write("\n");
  process.stderr.write(`  ${yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}\n`);
  if (isMajorBump) {
    process.stderr.write(
      `  ${yellow}⚡ Major update detected: ${currentVersion} → ${latestVersion}${reset}\n`,
    );
  } else {
    process.stderr.write(
      `  ${yellow}⚡ Significant update detected: ${currentVersion} → ${latestVersion}${reset}\n`,
    );
  }
  process.stderr.write(`  ${dim}Auto-updating to keep your CLI up to date...${reset}\n`);
  process.stderr.write(`  ${yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${reset}\n\n`);

  const cmd = `npm install -g ${NPM_PACKAGE}@latest`;

  try {
    const { execSync } = await import("child_process");
    execSync(cmd, { stdio: "inherit" });

    // Verify installed version
    let newVer: string | null = null;
    try {
      const rawVer = execSync("bl --version 2>/dev/null", { encoding: "utf-8" }).trim();
      newVer = rawVer.replace(/^bl\s+/, "");
    } catch {
      /* ignore */
    }

    // Update cached state
    try {
      const { writeFileSync } = await import("fs");
      const { join } = await import("path");
      const { getConfigDir } = await import("bailian-cli-core");
      const stateFile = join(getConfigDir(), "update-state.json");
      writeFileSync(
        stateFile,
        JSON.stringify({ lastChecked: Date.now(), latestVersion: newVer ?? latestVersion }),
      );
    } catch {
      /* ignore */
    }

    process.stderr.write(
      `  ${green}✓ Update complete: ${currentVersion} → ${newVer ?? latestVersion}${reset}\n`,
    );
    process.stderr.write(`  ${dim}Run ${cyan}bl --version${reset}${dim} to verify.${reset}\n\n`);

    // Update agent skill
    try {
      const { execSync: exec } = await import("child_process");
      process.stderr.write(`  ${dim}Syncing agent skill...${reset}\n`);
      exec(`npx skills add modelstudioai/cli --all -g -y`, { stdio: "inherit" });
      process.stderr.write(`  ${green}✓ Agent skill updated.${reset}\n\n`);
    } catch {
      process.stderr.write(
        `  ${yellow}Agent skill sync skipped (run manually: npx skills add modelstudioai/cli --all -g -y)${reset}\n\n`,
      );
    }

    // Clear pending notification
    pendingNotification = null;
    return true;
  } catch {
    process.stderr.write(`  ${yellow}⚠ Auto-update failed. Please run manually:${reset}\n`);
    process.stderr.write(`    ${cyan}${cmd}${reset}\n\n`);
    return false;
  }
}

export async function checkForUpdate(currentVersion: string): Promise<void> {
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

  const latest = await fetchLatestVersion();
  if (!latest) return;

  writeState({ lastChecked: now, latestVersion: latest });

  if (latest && isNewerVersion(latest, currentVersion)) {
    pendingNotification = latest;
  }
}
