import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const binaryUpdateMocks = vi.hoisted(() => ({
  performBinaryUpdate: vi.fn(),
}));

const childProcessMocks = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

vi.mock("../src/utils/binary-update.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/binary-update.ts")>();
  return { ...actual, performBinaryUpdate: binaryUpdateMocks.performBinaryUpdate };
});

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execSync: childProcessMocks.execSync };
});

import {
  compareVersion,
  isMajorUpgrade,
  isNewerVersion,
  isPrerelease,
  parseVersion,
  performAutoUpdate,
  shouldAutoUpdate,
} from "../src/utils/update-checker.ts";

let configDir: string;
let previousConfigDir: string | undefined;
let previousInstallMethod: string | undefined;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "bl-auto-update-binary-"));
  previousConfigDir = process.env.BAILIAN_CONFIG_DIR;
  previousInstallMethod = process.env.BAILIAN_INSTALL_METHOD;
  process.env.BAILIAN_CONFIG_DIR = configDir;
  process.env.BAILIAN_INSTALL_METHOD = "binary";
  binaryUpdateMocks.performBinaryUpdate.mockResolvedValue("2.0.0");
});

afterEach(() => {
  if (previousConfigDir === undefined) delete process.env.BAILIAN_CONFIG_DIR;
  else process.env.BAILIAN_CONFIG_DIR = previousConfigDir;
  if (previousInstallMethod === undefined) delete process.env.BAILIAN_INSTALL_METHOD;
  else process.env.BAILIAN_INSTALL_METHOD = previousInstallMethod;
  rmSync(configDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

test("parseVersion strips pre-release and build metadata", () => {
  expect(parseVersion("1.4.2")).toEqual([1, 4, 2]);
  expect(parseVersion("2.0.0-beta.1")).toEqual([2, 0, 0]);
  expect(parseVersion("2.0.0+build.42")).toEqual([2, 0, 0]);
  expect(parseVersion("2.0.0-beta.1+build.42")).toEqual([2, 0, 0]);
});

test("parseVersion coerces non-numeric segments to 0 instead of NaN", () => {
  const [a, b, c] = parseVersion("2.0.0-beta.1");
  expect(Number.isNaN(a)).toBe(false);
  expect(Number.isNaN(b)).toBe(false);
  expect(Number.isNaN(c)).toBe(false);
  expect([a, b, c]).toEqual([2, 0, 0]);
});

test("isNewerVersion never misjudges pre-release versions as equal", () => {
  // Pre-release of a higher version must still be detected as newer.
  expect(isNewerVersion("2.0.0-beta.1", "1.4.2")).toBe(true);
  // Pre-release target must not be considered newer than an equal release.
  expect(isNewerVersion("1.4.2", "2.0.0-beta.1")).toBe(false);
  // Patch bump still detected.
  expect(isNewerVersion("1.4.3", "1.4.2")).toBe(true);
  // Equal versions are not newer.
  expect(isNewerVersion("1.4.2", "1.4.2")).toBe(false);
  // A release outranks its own pre-release: the release IS newer.
  expect(isNewerVersion("1.4.2", "1.4.2-beta.1")).toBe(true);
  // ...and the pre-release is NOT newer than the release.
  expect(isNewerVersion("1.4.2-beta.1", "1.4.2")).toBe(false);
});

test("isMajorUpgrade handles pre-release versions without false negatives", () => {
  // Major bump through a pre-release channel must trigger.
  expect(isMajorUpgrade("2.0.0-beta.1", "1.4.2")).toBe(true);
  // Small minor gap does not trigger.
  expect(isMajorUpgrade("1.5.0", "1.4.2")).toBe(false);
  // Minor gap > 3 triggers within the same major.
  expect(isMajorUpgrade("1.8.0", "1.4.2")).toBe(true);
  // No upgrade.
  expect(isMajorUpgrade("1.4.2", "1.4.2")).toBe(false);
  // Pre-release of the same major/minor does not trigger.
  expect(isMajorUpgrade("1.4.2-beta.1", "1.4.2")).toBe(false);
});

// All published beta builds use the `0.0.0-<meta>` convention today. Under that
// scheme a beta collapses to [0,0,0], so a stable release is always a major
// upgrade over a beta. The robust invariants — regardless of hash ordering —
// are: beta -> stable auto-updates, canary -> canary never auto-updates, and a
// stable user is never upgraded down to a canary.
test("beta builds (0.0.0-*) auto-update to stable, never to another beta", () => {
  const beta = "0.0.0-beta-e0a7c86-20260624";
  const otherBeta = "0.0.0-beta-aaaaaaaa-20260625";
  const stable = "1.4.2";

  // beta -> stable: newer, significant, and stable -> auto-update
  expect(isNewerVersion(stable, beta)).toBe(true);
  expect(shouldAutoUpdate(stable, beta)).toBe(true);

  // canary -> canary: never auto-updates (same core, no major gap)
  expect(shouldAutoUpdate(otherBeta, beta)).toBe(false);
  expect(shouldAutoUpdate(beta, otherBeta)).toBe(false);

  // stable -> canary: never an upgrade
  expect(isNewerVersion(beta, stable)).toBe(false);
  expect(shouldAutoUpdate(beta, stable)).toBe(false);
});

test("isPrerelease detects pre-release suffixes and ignores build metadata", () => {
  expect(isPrerelease("1.4.2")).toBe(false);
  expect(isPrerelease("1.4.2-beta.1")).toBe(true);
  expect(isPrerelease("0.0.0-beta-e0a7c86-20260624")).toBe(true);
  expect(isPrerelease("2.0.0-alpha")).toBe(true);
  // Build metadata alone does not make a version a pre-release.
  expect(isPrerelease("1.4.2+build.42")).toBe(false);
  expect(isPrerelease("1.4.2-beta.1+build.42")).toBe(true);
});

test("compareVersion respects full semver pre-release precedence", () => {
  // Release outranks its own pre-release (the case the old stripper missed).
  expect(compareVersion("1.4.2", "1.4.2-beta.1")).toBeGreaterThan(0);
  expect(compareVersion("1.4.2-beta.1", "1.4.2")).toBeLessThan(0);
  // Numeric pre-release identifiers compared numerically.
  expect(compareVersion("1.4.2-beta.11", "1.4.2-beta.2")).toBeGreaterThan(0);
  // Alphanumeric identifiers compared lexically (rc > beta > alpha).
  expect(compareVersion("1.4.2-rc.1", "1.4.2-beta.5")).toBeGreaterThan(0);
  expect(compareVersion("1.4.2-beta.1", "1.4.2-alpha.1")).toBeGreaterThan(0);
  // Numeric identifier has lower precedence than a non-numeric one.
  expect(compareVersion("1.4.2-alpha.beta", "1.4.2-alpha.1")).toBeGreaterThan(0);
  // Canonical semver ordering end-to-end.
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    expect(compareVersion(ordered[i + 1]!, ordered[i]!)).toBeGreaterThan(0);
  }
});

test("shouldAutoUpdate only targets stable releases with a significant gap", () => {
  // Stable major bump: auto-update.
  expect(shouldAutoUpdate("2.0.0", "1.4.2")).toBe(true);
  // Stable minor gap > 3: auto-update.
  expect(shouldAutoUpdate("1.8.0", "1.4.2")).toBe(true);
  // Small stable gap: notify only.
  expect(shouldAutoUpdate("1.5.0", "1.4.2")).toBe(false);
  // Pre-release target is NEVER auto-installed, even on a major bump.
  expect(shouldAutoUpdate("2.0.0-beta.1", "1.4.2")).toBe(false);
  expect(shouldAutoUpdate("2.0.0-rc.1", "1.4.2")).toBe(false);
  // Same core, release over its pre-release: notify only (no major gap).
  expect(shouldAutoUpdate("1.4.2", "1.4.2-beta.1")).toBe(false);
});

test("binary auto-update syncs bailian skills after the CLI update succeeds", async () => {
  const updated = await performAutoUpdate("1.14.3", "2.0.0");

  expect(updated).toBe(true);
  expect(binaryUpdateMocks.performBinaryUpdate).toHaveBeenCalledWith("2.0.0");
  expect(childProcessMocks.execSync).toHaveBeenCalledWith("bl skill init", { stdio: "inherit" });
});
