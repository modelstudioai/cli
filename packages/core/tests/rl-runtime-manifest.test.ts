import { describe, expect, test } from "vite-plus/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertArtifactIntegrity,
  BailianError,
  bundledRuntimeManifest,
  DEFAULT_PYTHON_MIRRORS,
  parseRuntimeManifest,
  pythonDownloadCandidates,
  resolveRuntime,
  RL_DASHSCOPE_VERSION,
  RL_DASHSCOPE_WHEEL_SHA256,
  RL_DEPENDENCY_LOCK,
  RL_PYTHON_MIRROR_ENV,
  runtimeRoot,
  RUNTIME_OVERRIDE_ENV,
  selectManifestEntry,
  sha256Hex,
  UsageError,
  type IRuntimeManifest,
} from "../src/index.ts";
import { withIsolatedHome } from "./helpers/isolation.ts";

const PYTHON_SHA = sha256Hex("cpython-bytes");

function manifestFixture(): IRuntimeManifest {
  return {
    schemaVersion: 2,
    dashscopeVersion: RL_DASHSCOPE_VERSION,
    dashscopeUrl: "https://files.pythonhosted.org/packages/dashscope-1.25.23-py3-none-any.whl",
    dashscopeSha256: RL_DASHSCOPE_WHEEL_SHA256,
    entries: [
      {
        os: "linux",
        arch: "x64",
        triple: "x86_64-unknown-linux-gnu",
        pythonVersion: "3.11.9",
        pythonUrl: "https://example.com/cpython-3.11.9-install_only.tar.gz",
        pythonSha256: PYTHON_SHA,
      },
    ],
  };
}

describe("parseRuntimeManifest (schema v2)", () => {
  test("parses a valid manifest", () => {
    const manifest = parseRuntimeManifest(JSON.stringify(manifestFixture()));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].os).toBe("linux");
    expect(manifest.dashscopeSha256).toBe(RL_DASHSCOPE_WHEEL_SHA256);
  });

  test("rejects invalid JSON, missing fields and legacy schemaVersion", () => {
    expect(() => parseRuntimeManifest("{broken")).toThrow(UsageError);
    expect(() => parseRuntimeManifest(JSON.stringify({ schemaVersion: 2 }))).toThrow(UsageError);
    expect(() => parseRuntimeManifest(JSON.stringify({ schemaVersion: 1 }))).toThrow(UsageError);
    expect(() =>
      parseRuntimeManifest(
        JSON.stringify({
          schemaVersion: 2,
          dashscopeVersion: "1.25.23",
          dashscopeUrl: "https://example.com/wheel.whl",
          dashscopeSha256: RL_DASHSCOPE_WHEEL_SHA256,
          entries: [{}],
        }),
      ),
    ).toThrow(UsageError);
  });

  test("rejects malformed SHA256 on both python and dashscope", () => {
    const badPython = manifestFixture();
    badPython.entries[0].pythonSha256 = "not-a-hash";
    expect(() => parseRuntimeManifest(JSON.stringify(badPython))).toThrow(UsageError);
    const badDashscope = manifestFixture();
    badDashscope.dashscopeSha256 = "not-a-hash";
    expect(() => parseRuntimeManifest(JSON.stringify(badDashscope))).toThrow(UsageError);
  });
});

describe("selectManifestEntry", () => {
  test("matches os/arch and rejects unsupported combinations", () => {
    const manifest = manifestFixture();
    expect(selectManifestEntry(manifest, "linux", "x64")?.pythonVersion).toBe("3.11.9");
    expect(selectManifestEntry(manifest, "win32", "x64")).toBeUndefined();
    expect(selectManifestEntry(manifest, "linux", "arm64")).toBeUndefined();
  });
});

describe("artifact integrity", () => {
  test("accepts matching SHA256 and rejects mismatch", () => {
    const data = Buffer.from("cpython-bytes");
    expect(() => assertArtifactIntegrity(data, PYTHON_SHA)).not.toThrow();
    expect(() => assertArtifactIntegrity(data, sha256Hex("tampered"))).toThrow(BailianError);
  });
});

describe("bundled reviewed manifest", () => {
  test("covers four platforms with the reviewed dashscope baseline", () => {
    const manifest = bundledRuntimeManifest();
    expect(manifest.dashscopeVersion).toBe(RL_DASHSCOPE_VERSION);
    expect(manifest.dashscopeSha256).toBe(RL_DASHSCOPE_WHEEL_SHA256);
    expect(manifest.entries).toHaveLength(4);
    for (const entry of manifest.entries) {
      expect(entry.pythonSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.pythonUrl).toContain("python-build-standalone");
    }
  });

  test("stays in sync with the repo-root runtime-manifest.json source of truth", () => {
    const jsonPath = fileURLToPath(new URL("../../../runtime-manifest.json", import.meta.url));
    const fromDisk = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(bundledRuntimeManifest()).toEqual(fromDisk);
  });
});

describe("dependency lockfile", () => {
  test("pins the reviewed dashscope wheel hash for --require-hashes", () => {
    expect(RL_DEPENDENCY_LOCK).toContain(`dashscope==${RL_DASHSCOPE_VERSION}`);
    expect(RL_DEPENDENCY_LOCK).toContain(RL_DASHSCOPE_WHEEL_SHA256);
    expect(RL_DEPENDENCY_LOCK).toContain("--hash=sha256:");
  });
});

describe("pythonDownloadCandidates (multi-source fallback)", () => {
  const githubUrl =
    "https://github.com/astral-sh/python-build-standalone/releases/download/20240415/cpython-3.11.9+20240415-x86_64-unknown-linux-gnu-install_only.tar.gz";
  const suffix = "20240415/cpython-3.11.9+20240415-x86_64-unknown-linux-gnu-install_only.tar.gz";

  test("orders canonical GitHub first then the built-in npmmirror fallback", () => {
    const candidates = pythonDownloadCandidates(githubUrl, {});
    expect(candidates).toEqual([githubUrl, `${DEFAULT_PYTHON_MIRRORS[0]}${suffix}`]);
  });

  test("prepends a custom mirror (normalized trailing slash) when env is set", () => {
    const candidates = pythonDownloadCandidates(githubUrl, {
      [RL_PYTHON_MIRROR_ENV]: "https://mirror.internal/python-build-standalone",
    });
    expect(candidates[0]).toBe(`https://mirror.internal/python-build-standalone/${suffix}`);
    expect(candidates[1]).toBe(githubUrl);
    expect(candidates[2]).toBe(`${DEFAULT_PYTHON_MIRRORS[0]}${suffix}`);
  });

  test("dedupes when the custom mirror equals the built-in fallback", () => {
    const candidates = pythonDownloadCandidates(githubUrl, {
      [RL_PYTHON_MIRROR_ENV]: DEFAULT_PYTHON_MIRRORS[0],
    });
    expect(candidates).toEqual([`${DEFAULT_PYTHON_MIRRORS[0]}${suffix}`, githubUrl]);
  });

  test("does not rewrite a non-GitHub canonical URL", () => {
    const custom = "https://example.com/cpython-3.11.9-install_only.tar.gz";
    expect(pythonDownloadCandidates(custom, {})).toEqual([custom]);
  });
});

describe("resolveRuntime", () => {
  /** override 版本探测 deps：模拟 importlib.metadata 实测结果。 */
  function probeDeps(stdout: string, exitCode = 0) {
    return {
      async download() {
        return Buffer.from("");
      },
      async run() {
        return { exitCode, stdout, stderr: "" };
      },
    };
  }

  test("reuses a dev override and reports the measured dashscope version", async () => {
    await withIsolatedHome(async (home) => {
      const overrideDir = join(home, "dev-runtime");
      mkdirSync(join(overrideDir, "bin"), { recursive: true });
      writeFileSync(join(overrideDir, "bin", "python"), "");
      const resolved = await resolveRuntime({
        env: { [RUNTIME_OVERRIDE_ENV]: overrideDir },
        platform: "linux",
        deps: probeDeps(`${RL_DASHSCOPE_VERSION}\n`),
      });
      expect(resolved.source).toBe("override");
      expect(resolved.pythonPath).toBe(join(overrideDir, "bin", "python"));
      expect(resolved.dashscopeVersion).toBe(RL_DASHSCOPE_VERSION);
    });
  });

  test("override reports a non-baseline version honestly (no constant lie)", async () => {
    await withIsolatedHome(async (home) => {
      const overrideDir = join(home, "dev-runtime");
      mkdirSync(join(overrideDir, "bin"), { recursive: true });
      writeFileSync(join(overrideDir, "bin", "python"), "");
      const resolved = await resolveRuntime({
        env: { [RUNTIME_OVERRIDE_ENV]: overrideDir },
        platform: "linux",
        deps: probeDeps("9.9.9\n"),
      });
      expect(resolved.dashscopeVersion).toBe("9.9.9");
    });
  });

  test("override without an importable dashscope fails closed", async () => {
    await withIsolatedHome(async (home) => {
      const overrideDir = join(home, "dev-runtime");
      mkdirSync(join(overrideDir, "bin"), { recursive: true });
      writeFileSync(join(overrideDir, "bin", "python"), "");
      await expect(
        resolveRuntime({
          env: { [RUNTIME_OVERRIDE_ENV]: overrideDir },
          platform: "linux",
          deps: probeDeps("", 1),
        }),
      ).rejects.toThrow(BailianError);
    });
  });

  test("fails when the override has no interpreter", async () => {
    await withIsolatedHome(async (home) => {
      await expect(
        resolveRuntime({ env: { [RUNTIME_OVERRIDE_ENV]: join(home, "empty") }, platform: "linux" }),
      ).rejects.toThrow(BailianError);
    });
  });

  test("returns RUNTIME_UNAVAILABLE for an unsupported platform", async () => {
    await withIsolatedHome(async () => {
      await expect(
        resolveRuntime({ env: {}, platform: "win32", arch: "x64" }),
      ).rejects.toMatchObject({ message: expect.stringContaining("RUNTIME_UNAVAILABLE") });
    });
  });

  test("selects the bundled manifest and reports not-prepared when install disallowed", async () => {
    await withIsolatedHome(async () => {
      await expect(
        resolveRuntime({ env: {}, platform: "linux", arch: "x64", allowInstall: false }),
      ).rejects.toMatchObject({
        message: expect.stringContaining("RUNTIME_UNAVAILABLE"),
        exitCode: 1,
      });
    });
  });

  test("reuses a prepared managed runtime marked READY", async () => {
    await withIsolatedHome(async () => {
      const runtimeId = `linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`;
      const root = runtimeRoot(runtimeId);
      mkdirSync(join(root, "python", "bin"), { recursive: true });
      writeFileSync(join(root, "python", "bin", "python3.11"), "");
      writeFileSync(join(root, "READY"), "{}\n");
      const resolved = await resolveRuntime({
        env: {},
        manifest: manifestFixture(),
        platform: "linux",
        arch: "x64",
      });
      expect(resolved.source).toBe("managed");
      expect(resolved.pythonPath).toBe(join(root, "python", "bin", "python3.11"));
    });
  });
});
