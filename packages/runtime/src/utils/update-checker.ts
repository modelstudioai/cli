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
 * Parse a version string into a numeric [major, minor, patch] tuple.
 *
 * Pre-release (`-beta.1`) and build (`+build.42`) metadata are stripped
 * first, and any non-numeric segment is coerced to 0. This guarantees we
 * never produce `NaN` (which makes every comparison silently false) for
 * versions like `2.0.0-beta.1` where `Number("0-beta")` would otherwise be
 * `NaN`.
 */
export function parseVersion(version: string): [number, number, number] {
  const core = String(version).split("+")[0].split("-")[0].trim();
  const parts = core.split(".").map((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Extract the pre-release suffix of a version (e.g. `1.4.2-beta.1` -> `beta.1`),
 * ignoring build metadata. Returns `""` for a plain release (`1.4.2`).
 */
function prereleaseOf(version: string): string {
  const core = String(version).split("+")[0];
  const idx = core.indexOf("-");
  return idx >= 0 ? core.slice(idx + 1) : "";
}

/**
 * True if the version is a pre-release (carries a `-suffix`), e.g.
 * `1.4.2-beta.1` or `0.0.0-beta-e0a7c86`. Build metadata (`+build`) is ignored.
 */
export function isPrerelease(version: string): boolean {
  return prereleaseOf(version) !== "";
}

function isNumericIdentifier(s: string): boolean {
  return s.length > 0 && /^[0-9]+$/.test(s);
}

/**
 * Compare two pre-release suffixes per semver precedence rules.
 * Returns >0 if `a` has higher precedence, <0 if lower, 0 if equal.
 *
 * A release (empty suffix) has HIGHER precedence than any pre-release, so:
 *   comparePrerelease("", "beta.1")  ->  >0  (1.4.2 > 1.4.2-beta.1)
 *   comparePrerelease("beta.1", "")  ->  <0
 *
 * When both are pre-releases, dot-separated identifiers are compared left to
 * right: numeric identifiers numerically, alphanumeric lexically (ASCII), and
 * a numeric identifier has lower precedence than an alphanumeric one.
 */
function comparePrerelease(aPre: string, bPre: string): number {
  const aIds = aPre ? aPre.split(".") : [];
  const bIds = bPre ? bPre.split(".") : [];
  if (aIds.length === 0 && bIds.length === 0) return 0;
  // A version without a pre-release outranks one with a pre-release.
  if (aIds.length === 0) return 1;
  if (bIds.length === 0) return -1;
  const len = Math.max(aIds.length, bIds.length);
  for (let i = 0; i < len; i++) {
    const ai = aIds[i];
    const bi = bIds[i];
    if (ai === undefined) return -1; // fewer identifiers -> lower precedence
    if (bi === undefined) return 1;
    const aNum = isNumericIdentifier(ai);
    const bNum = isNumericIdentifier(bi);
    if (aNum && bNum) {
      const diff = Number(ai) - Number(bi);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (aNum !== bNum) {
      // Numeric identifier has lower precedence than a non-numeric one.
      return aNum ? -1 : 1;
    } else if (ai !== bi) {
      return ai > bi ? 1 : -1;
    }
  }
  return 0;
}

/**
 * Full semver precedence comparison.
 * Returns >0 if `a > b`, <0 if `a < b`, 0 if equal.
 * Respects pre-release precedence (release > pre-release).
 */
export function compareVersion(a: string, b: string): number {
  const [pa0, pa1, pa2] = parseVersion(a);
  const [pb0, pb1, pb2] = parseVersion(b);
  if (pa0 !== pb0) return pa0 > pb0 ? 1 : -1;
  if (pa1 !== pb1) return pa1 > pb1 ? 1 : -1;
  if (pa2 !== pb2) return pa2 > pb2 ? 1 : -1;
  return comparePrerelease(prereleaseOf(a), prereleaseOf(b));
}

/**
 * Semver comparison: returns true if a > b.
 * Handles pre-release and build metadata with correct precedence, so a stable
 * release is correctly detected as newer than its own pre-release
 * (`isNewerVersion("1.4.2", "1.4.2-beta.1")` -> true).
 */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersion(a, b) > 0;
}

/**
 * Policy gate for unattended auto-update.
 *
 * Auto-update runs `npm install -g @latest` without supervision, so it must
 * only target a stable release — never a pre-release (`2.0.0-beta.1`), since
 * silently jumping a user onto a beta channel is unsafe. A pre-release latest
 * is reported as a notification instead.
 *
 * Combined with `isMajorUpgrade`, the rule is: a significant version gap
 * (major bump or minor gap > 3) AND the target is a stable release.
 */
export function shouldAutoUpdate(latest: string, current: string): boolean {
  return isMajorUpgrade(latest, current) && !isPrerelease(latest);
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

/**
 * Determines if the version gap is large enough to warrant auto-update.
 * Conditions (either triggers auto-update):
 * 1. New major > current major
 * 2. Same major, but new minor - current minor > 3
 */
export function isMajorUpgrade(latest: string, current: string): boolean {
  const [latestMajor, latestMinor] = parseVersion(latest);
  const [currentMajor, currentMinor] = parseVersion(current);

  // Condition 1: major version bump
  if (latestMajor > currentMajor) return true;

  // Condition 2: same major, minor gap > 3
  if (latestMajor === currentMajor && latestMinor - currentMinor > 3) return true;

  return false;
}

/**
 * Extract a single-line error message from an unknown thrown value,
 * so failures can be surfaced to the user instead of swallowed.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Perform auto-update: install latest version globally and update agent skill.
 * Returns true if update succeeded, false otherwise.
 */
export async function performAutoUpdate(
  currentVersion: string,
  latestVersion: string,
  npmPackage: string = NPM_PACKAGE,
): Promise<boolean> {
  const isTTY = process.stderr.isTTY;
  const green = isTTY ? "\x1b[32m" : "";
  const yellow = isTTY ? "\x1b[33m" : "";
  const cyan = isTTY ? "\x1b[36m" : "";
  const dim = isTTY ? "\x1b[2m" : "";
  const reset = isTTY ? "\x1b[0m" : "";

  const [latestMajor] = parseVersion(latestVersion);
  const [currentMajor] = parseVersion(currentVersion);
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

  const cmd = `npm install -g ${npmPackage}@latest`;

  try {
    const { execSync } = await import("child_process");
    execSync(cmd, { stdio: "inherit" });

    // Verify the actually-installed version by reading the global package.json.
    // We must NOT rely on `bl --version`: the user may run via npx, a local
    // install, or a custom bin name, in which case `bl` on PATH points at the
    // wrong binary (or nothing at all). Reading the installed package directly
    // is correct regardless of how the CLI was invoked.
    let newVer: string | null = null;
    try {
      const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
      const pkgPath = join(globalRoot, npmPackage, "package.json");
      const rawPkg = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(rawPkg) as { version?: string };
      newVer = pkg.version ?? null;
    } catch (err) {
      process.stderr.write(
        `  ${yellow}⚠ Could not verify installed version: ${errorMessage(err)}${reset}\n`,
      );
    }

    // Update cached state. writeState swallows errors internally: state caching
    // is non-critical and must never break the CLI startup path.
    writeState({ lastChecked: Date.now(), latestVersion: newVer ?? latestVersion });

    process.stderr.write(
      `  ${green}✓ Update complete: ${currentVersion} → ${newVer ?? latestVersion}${reset}\n`,
    );
    process.stderr.write(`  ${dim}Run ${cyan}bl --version${reset}${dim} to verify.${reset}\n\n`);

    // Update agent skill
    try {
      process.stderr.write(`  ${dim}Syncing agent skill...${reset}\n`);
      execSync(`npx skills add modelstudioai/cli --all -g -y`, { stdio: "inherit" });
      process.stderr.write(`  ${green}✓ Agent skill updated.${reset}\n\n`);
    } catch (err) {
      // Surface the reason the skill sync failed rather than swallowing it
      // silently, but keep degradation: the CLI itself already updated.
      process.stderr.write(`  ${yellow}⚠ Agent skill sync failed: ${errorMessage(err)}${reset}\n`);
      process.stderr.write(
        `  ${yellow}  Run manually: npx skills add modelstudioai/cli --all -g -y${reset}\n\n`,
      );
    }

    // Clear pending notification
    pendingNotification = null;
    return true;
  } catch (err) {
    // npm install failure — most commonly EACCES (global installs often need
    // elevated permissions). Tell the user *why* it failed, not just *that*.
    process.stderr.write(`  ${yellow}⚠ Auto-update failed: ${errorMessage(err)}${reset}\n`);
    process.stderr.write(
      `  ${yellow}  If this is a permissions error (EACCES), retry with sudo or fix npm perms.${reset}\n`,
    );
    process.stderr.write(`  ${yellow}  Run manually:${reset} ${cyan}${cmd}${reset}\n\n`);
    return false;
  }
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
