import { httpTransport } from "bailian-cli-core";
import { createOutputReporter } from "../src/output/reporter.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
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
  checkForUpdate,
  getPendingUpdateNotification,
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

function expectSkillUpdateNotInit(): void {
  expect(childProcessMocks.execSync).toHaveBeenCalledWith("bl skill update", { stdio: "pipe" });
  expect(
    childProcessMocks.execSync.mock.calls.some((call) => String(call[0]).includes("skill init")),
  ).toBe(false);
}

test("binary auto-update refreshes installed skills and does not run skill init", async () => {
  const updated = await performAutoUpdate("1.14.3", "2.0.0", "bailian-cli", "bailian-cli", {
    output: createOutputReporter({ settings: { output: "text", quiet: true, verbose: false } })
      .output,
    binName: "bl",
  });

  expect(updated).toBe(true);
  expect(binaryUpdateMocks.performBinaryUpdate).toHaveBeenCalledWith("2.0.0");
  expectSkillUpdateNotInit();
});

test("npm auto-update refreshes installed skills and does not run skill init", async () => {
  process.env.BAILIAN_INSTALL_METHOD = "npm";
  childProcessMocks.execSync.mockReturnValue("");

  const updated = await performAutoUpdate("1.14.3", "2.0.0", "bailian-cli", "bailian-cli", {
    output: createOutputReporter({ settings: { output: "text", quiet: true, verbose: false } })
      .output,
    binName: "bl",
  });

  expect(updated).toBe(true);
  expect(childProcessMocks.execSync).toHaveBeenCalledWith("npm install -g bailian-cli@latest", {
    stdio: "pipe",
  });
  expectSkillUpdateNotInit();
});

test("auto-update uses the injected output and captures subprocess streams", async () => {
  let stderr = "";
  const output = createOutputReporter({
    settings: { output: "json", quiet: true, verbose: false },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  }).output;
  const direct = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    expect(
      await performAutoUpdate("1.14.3", "2.0.0", "bailian-cli", "bailian-cli", {
        output,
        binName: "bl",
      }),
    ).toBe(true);
    expect(stderr).toBe("");
    expect(direct).not.toHaveBeenCalled();
    expect(childProcessMocks.execSync).toHaveBeenCalledWith("bl skill update", { stdio: "pipe" });
  } finally {
    direct.mockRestore();
  }
});

test.each([false, true])(
  "kscli updates retain the existing bl skill sync with failure=%s",
  async (fails) => {
    const output = { info: vi.fn(), warning: vi.fn() };
    if (fails) {
      childProcessMocks.execSync.mockImplementation((command) => {
        if (command === "bl skill update" || command === "kscli skill update") {
          throw new Error("mock skill sync failure");
        }
        return "";
      });
    }
    expect(
      await performAutoUpdate("1.14.3", "2.0.0", "knowledge-studio-cli", "knowledge-studio-cli", {
        output,
        binName: "kscli",
      }),
    ).toBe(true);
    expect(childProcessMocks.execSync).toHaveBeenCalledWith("bl skill update", { stdio: "pipe" });
    expect(childProcessMocks.execSync).not.toHaveBeenCalledWith(
      "kscli skill update",
      expect.anything(),
    );
    if (fails) {
      expect(output.warning).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SKILL_SYNC_FAILED",
          message: {
            "en-US": expect.stringContaining("Run bl skill update manually."),
            "zh-CN": expect.stringContaining("请手动运行 bl skill update。"),
          },
        }),
      );
    } else {
      expect(output.warning).not.toHaveBeenCalledWith(
        expect.objectContaining({ code: "SKILL_SYNC_FAILED" }),
      );
    }
  },
);

test.each([false, true])(
  "npm root diagnostics never bypass JSON output with failure=%s",
  async (fails) => {
    process.env.BAILIAN_INSTALL_METHOD = "npm";
    const globalRoot = join(configDir, "global");
    mkdirSync(join(globalRoot, "bailian-cli"), { recursive: true });
    writeFileSync(
      join(globalRoot, "bailian-cli", "package.json"),
      JSON.stringify({ version: "2.0.0" }),
    );
    childProcessMocks.execSync.mockImplementation((command, options) => {
      if (command !== "npm root -g") return "";
      // Exercise Node's actual child stderr forwarding, without running npm or an installation.
      return execFileSync(
        process.execPath,
        [
          "-e",
          [
            'process.stderr.write("npm WARN mock-root-diagnostic\\n");',
            `process.stdout.write(${JSON.stringify(globalRoot)});`,
            `process.exit(${fails ? 1 : 0});`,
          ].join("\n"),
        ],
        options as ExecFileSyncOptionsWithStringEncoding,
      );
    });
    let diagnostics = "";
    const output = createOutputReporter({
      settings: { output: "json", quiet: true, verbose: false },
      stderr: {
        write: (chunk) => {
          diagnostics += chunk;
        },
      },
    }).output;
    let bypassed = "";
    const direct = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      bypassed += String(chunk);
      return true;
    });
    try {
      expect(
        await performAutoUpdate("1.0.0", "2.0.0", "bailian-cli", "bailian-cli", {
          output,
          binName: "bl",
        }),
      ).toBe(true);
      expect(bypassed).toBe("");
      if (fails) {
        const records = diagnostics
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        expect(records).toHaveLength(1);
        expect(records[0].warning.code).toBe("UPDATE_VERSION_UNVERIFIED");
        expect(records[0].warning.message).toContain("npm WARN mock-root-diagnostic");
      } else {
        expect(diagnostics).toBe("");
      }
    } finally {
      direct.mockRestore();
    }
  },
);

test("cached newer versions notify without another network check and clear after upgrading", async () => {
  writeFileSync(
    join(configDir, "update-state.json"),
    JSON.stringify({
      lastChecked: Date.now(),
      latestVersion: "2.6.1",
    }),
  );
  const network = vi
    .spyOn(httpTransport, "fetch")
    .mockRejectedValue(new Error("Network must not be used"));
  try {
    await checkForUpdate("2.3.0");
    expect(getPendingUpdateNotification()).toBe("2.6.1");
    await checkForUpdate("2.6.1");
    expect(getPendingUpdateNotification()).toBeNull();
    await checkForUpdate("2.7.0");
    expect(getPendingUpdateNotification()).toBeNull();
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
