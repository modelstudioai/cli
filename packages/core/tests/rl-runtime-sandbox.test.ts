import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IIsolationResult } from "../src/isolation/types.ts";

// 黑盒编排测试 mock 掉隔离执行，避免真实 spawn；保留 app-layer 其余导出。
const mocks = vi.hoisted(() => ({
  isolatedRun: vi.fn(),
}));
vi.mock("../src/isolation/app-layer.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/isolation/app-layer.ts")>();
  return { ...actual, executeIsolatedRun: mocks.isolatedRun };
});

import {
  BailianError,
  executeInSandbox,
  installRuntime,
  normalizeSandboxResult,
  RL_DASHSCOPE_VERSION,
  RL_DASHSCOPE_WHEEL_SHA256,
  RL_DEPENDENCY_LOCK,
  RL_PIP_INDEX_ENV,
  RL_PYTHON_MIRROR_ENV,
  runtimeRoot,
  RUNTIME_OVERRIDE_ENV,
  sha256Hex,
  type IRuntimeDeps,
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

function okResult(stdout: string): IIsolationResult {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    timedOut: false,
    credentialDenyEnforced: true,
    hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
  };
}

describe("normalizeSandboxResult", () => {
  test("returns parsed JSON on success and raw fallback for non-JSON", () => {
    expect(normalizeSandboxResult(okResult('{"job_id":"j1"}'))).toEqual({ job_id: "j1" });
    expect(normalizeSandboxResult(okResult("plain text"))).toEqual({ raw: "plain text" });
  });

  test("maps timeout to TIMEOUT without canceling the cloud job", () => {
    const timedOut = { ...okResult(""), timedOut: true };
    expect(() => normalizeSandboxResult(timedOut)).toThrow(BailianError);
    try {
      normalizeSandboxResult(timedOut);
    } catch (error) {
      expect((error as BailianError).exitCode).toBe(5);
    }
  });

  test("passes server-side failures through verbatim", () => {
    const failed = { ...okResult('{"message":"boom"}'), exitCode: 1 };
    expect(() => normalizeSandboxResult(failed)).toThrow("boom");
    const stderrFailed = { ...okResult(""), exitCode: 1, stderr: "stderr detail" };
    expect(() => normalizeSandboxResult(stderrFailed)).toThrow("stderr detail");
  });
});

describe("executeInSandbox (black-box orchestration)", () => {
  beforeEach(() => {
    mocks.isolatedRun.mockReset();
    mocks.isolatedRun.mockResolvedValue(okResult('{"job_id":"j1"}'));
  });

  /** override 版本探测 deps：返回受审查基线版本（不真实 spawn）。 */
  function probeDeps(version: string = RL_DASHSCOPE_VERSION): IRuntimeDeps {
    return {
      async download() {
        return Buffer.from("");
      },
      async run() {
        return { exitCode: 0, stdout: `${version}\n`, stderr: "" };
      },
    };
  }

  test("injects interpreter prefix, credential, config, FC_PYPI_LIB and default deny path", async () => {
    await withIsolatedHome(async (home) => {
      const overrideDir = join(home, "dev-runtime");
      mkdirSync(join(overrideDir, "bin"), { recursive: true });
      writeFileSync(join(overrideDir, "bin", "python"), "");

      const data = await executeInSandbox({
        sdkArgs: ["rl", "get", "j1", "--output-format", "json"],
        credential: { token: "sk-test", baseUrl: "https://example.com" },
        runtimeOptions: {
          env: { [RUNTIME_OVERRIDE_ENV]: overrideDir },
          platform: "linux",
          deps: probeDeps(),
        },
        prepare: (layout) => {
          writeFileSync(join(layout.dataDir, "train.jsonl"), "{}\n");
          return "name: test\n";
        },
      });
      expect(data).toEqual({ job_id: "j1" });

      const input = mocks.isolatedRun.mock.calls[0][0];
      expect(input.runtimeRoot).toBe(overrideDir);
      expect(input.apiKey).toBe("sk-test");
      expect(input.baseUrl).toBe("https://example.com");
      expect(input.credentialDenyPaths).toEqual([join(homedir(), ".dashscope")]);
      // 1.25.23 无顶层 --output；JSON 输出由命令层叶子级 --output-format 携带。
      expect(input.command).toEqual([
        join(overrideDir, "bin", "python"),
        "-I",
        "-m",
        "dashscope.cli",
        "rl",
        "get",
        "j1",
        "--output-format",
        "json",
        "--config",
        input.layout.configPath,
      ]);
      // FC_PYPI_LIB 与提交端运行时版本锁步，用户零感知。
      expect(input.sdkEnv).toEqual({ FC_PYPI_LIB: `dashscope==${RL_DASHSCOPE_VERSION}` });
      // SDK 相对 cwd 写 start.sh：cwd 必须是可写的 deploy-copy（与 zipdir 一致）。
      expect(input.cwd).toBe(input.layout.deployCopyDir);
      expect(readFileSync(input.layout.configPath, "utf8")).toBe("name: test\n");
    });
  });

  test("FC_PYPI_LIB follows the measured override version (no baseline lie)", async () => {
    await withIsolatedHome(async (home) => {
      const overrideDir = join(home, "dev-runtime");
      mkdirSync(join(overrideDir, "bin"), { recursive: true });
      writeFileSync(join(overrideDir, "bin", "python"), "");
      await executeInSandbox({
        sdkArgs: ["rl", "list", "--output-format", "json"],
        credential: { token: "sk-test" },
        runtimeOptions: {
          env: { [RUNTIME_OVERRIDE_ENV]: overrideDir },
          platform: "linux",
          deps: probeDeps("9.9.9"),
        },
      });
      const input = mocks.isolatedRun.mock.calls[0][0];
      expect(input.sdkEnv).toEqual({ FC_PYPI_LIB: "dashscope==9.9.9" });
    });
  });

  test("omits --config when prepare returns nothing", async () => {
    await withIsolatedHome(async (home) => {
      const overrideDir = join(home, "dev-runtime");
      mkdirSync(join(overrideDir, "bin"), { recursive: true });
      writeFileSync(join(overrideDir, "bin", "python"), "");
      await executeInSandbox({
        sdkArgs: ["rl", "list", "--output-format", "json"],
        credential: { token: "sk-test" },
        runtimeOptions: {
          env: { [RUNTIME_OVERRIDE_ENV]: overrideDir },
          platform: "linux",
          deps: probeDeps(),
        },
      });
      const input = mocks.isolatedRun.mock.calls[0][0];
      expect(input.command).not.toContain("--config");
      expect(input.command).toContain("list");
    });
  });
});

/** mock deps：记录调用并模拟 tar 解压出解释器；可选注入 pip/import 失败。 */
function makeDeps(
  root: string,
  opts: { bytes?: Buffer; failPip?: boolean; failImport?: boolean } = {},
): { deps: IRuntimeDeps; calls: Array<{ command: string; args: string[] }> } {
  const calls: Array<{ command: string; args: string[] }> = [];
  const deps: IRuntimeDeps = {
    async download() {
      return opts.bytes ?? Buffer.from("cpython-bytes");
    },
    async run(command, args) {
      calls.push({ command, args });
      if (command === "tar") {
        mkdirSync(join(root, "python", "bin"), { recursive: true });
        writeFileSync(join(root, "python", "bin", "python3.11"), "");
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (opts.failPip && args.includes("pip")) {
        return { exitCode: 1, stdout: "", stderr: "pip boom" };
      }
      if (opts.failImport && args.includes("import dashscope")) {
        return { exitCode: 1, stdout: "", stderr: "import boom" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  };
  return { deps, calls };
}

describe("installRuntime (manifest-driven first download + cache)", () => {
  test("downloads CPython, verifies hash, installs locked deps, self-checks, marks READY", async () => {
    await withIsolatedHome(async () => {
      const manifest = manifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps, calls } = makeDeps(root);
      await installRuntime(manifest.entries[0], manifest, root, deps, "linux");

      expect(existsSync(join(root, "READY"))).toBe(true);
      expect(existsSync(join(root, "runtime.json"))).toBe(true);
      expect(readFileSync(join(root, "requirements.lock"), "utf8")).toBe(RL_DEPENDENCY_LOCK);

      const tarCall = calls.find((call) => call.command === "tar");
      expect(tarCall?.args).toContain("-xzf");
      const pipCall = calls.find((call) => call.args.includes("pip"));
      expect(pipCall?.args).toContain("--require-hashes");
      expect(calls.some((call) => call.args.includes("import dashscope"))).toBe(true);
    });
  });

  test("passes a custom pip index when BAILIAN_RL_PIP_INDEX_URL is set", async () => {
    await withIsolatedHome(async () => {
      const manifest = manifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps, calls } = makeDeps(root);
      await installRuntime(manifest.entries[0], manifest, root, deps, "linux", {
        [RL_PIP_INDEX_ENV]: "https://mirrors.aliyun.com/pypi/simple/",
      });
      const pipCall = calls.find((call) => call.args.includes("pip"));
      expect(pipCall?.args).toContain("--index-url");
      expect(pipCall?.args).toContain("https://mirrors.aliyun.com/pypi/simple/");
      expect(pipCall?.args).toContain("--require-hashes");
    });
  });

  test("refuses a tampered CPython artifact and never marks READY", async () => {
    await withIsolatedHome(async () => {
      const manifest = manifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps } = makeDeps(root, { bytes: Buffer.from("tampered") });
      await expect(
        installRuntime(manifest.entries[0], manifest, root, deps, "linux"),
      ).rejects.toThrow(BailianError);
      expect(existsSync(join(root, "READY"))).toBe(false);
    });
  });

  test("a failed dependency install leaves no READY marker", async () => {
    await withIsolatedHome(async () => {
      const manifest = manifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps } = makeDeps(root, { failPip: true });
      await expect(
        installRuntime(manifest.entries[0], manifest, root, deps, "linux"),
      ).rejects.toThrow(BailianError);
      expect(existsSync(join(root, "READY"))).toBe(false);
    });
  });

  test("a failed import self-check leaves no READY marker", async () => {
    await withIsolatedHome(async () => {
      const manifest = manifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps } = makeDeps(root, { failImport: true });
      await expect(
        installRuntime(manifest.entries[0], manifest, root, deps, "linux"),
      ).rejects.toThrow(BailianError);
      expect(existsSync(join(root, "READY"))).toBe(false);
    });
  });
});

/** GitHub canonical 清单（触发镜像回退候选）。 */
function githubManifestFixture(): IRuntimeManifest {
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
        pythonUrl:
          "https://github.com/astral-sh/python-build-standalone/releases/download/20240415/cpython-3.11.9+20240415-x86_64-unknown-linux-gnu-install_only.tar.gz",
        pythonSha256: PYTHON_SHA,
      },
    ],
  };
}

/** url 感知下载 mock：GitHub 源可注入网络失败/篡改，镜像源默认返回合法字节。 */
function makeFallbackDeps(
  root: string,
  opts: { github?: "ok" | "network" | "tamper"; mirror?: "ok" | "network" } = {},
): { deps: IRuntimeDeps; urls: string[] } {
  const urls: string[] = [];
  const deps: IRuntimeDeps = {
    async download(url) {
      urls.push(url);
      const mode = url.includes("github.com") ? (opts.github ?? "ok") : (opts.mirror ?? "ok");
      if (mode === "network") throw new Error("network stall");
      if (mode === "tamper") return Buffer.from("tampered");
      return Buffer.from("cpython-bytes");
    },
    async run(command) {
      if (command === "tar") {
        mkdirSync(join(root, "python", "bin"), { recursive: true });
        writeFileSync(join(root, "python", "bin", "python3.11"), "");
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  };
  return { deps, urls };
}

describe("installRuntime (multi-source download fallback)", () => {
  test("falls back to npmmirror when the GitHub download stalls", async () => {
    await withIsolatedHome(async () => {
      const manifest = githubManifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps, urls } = makeFallbackDeps(root, { github: "network" });
      await installRuntime(manifest.entries[0], manifest, root, deps, "linux", {});
      expect(existsSync(join(root, "READY"))).toBe(true);
      expect(readFileSync(join(root, "requirements.lock"), "utf8")).toBe(RL_DEPENDENCY_LOCK);
      expect(urls[0]).toContain("github.com");
      expect(urls[1]).toContain("npmmirror.com");
    });
  });

  test("falls back when GitHub serves a tampered artifact (SHA mismatch)", async () => {
    await withIsolatedHome(async () => {
      const manifest = githubManifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps, urls } = makeFallbackDeps(root, { github: "tamper" });
      await installRuntime(manifest.entries[0], manifest, root, deps, "linux", {});
      expect(existsSync(join(root, "READY"))).toBe(true);
      expect(urls.some((url) => url.includes("npmmirror.com"))).toBe(true);
    });
  });

  test("never marks READY when every candidate source fails", async () => {
    await withIsolatedHome(async () => {
      const manifest = githubManifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps } = makeFallbackDeps(root, { github: "network", mirror: "network" });
      await expect(
        installRuntime(manifest.entries[0], manifest, root, deps, "linux", {}),
      ).rejects.toThrow();
      expect(existsSync(join(root, "READY"))).toBe(false);
    });
  });

  test("tries a custom mirror first when BAILIAN_RL_PYTHON_MIRROR is set", async () => {
    await withIsolatedHome(async () => {
      const manifest = githubManifestFixture();
      const root = runtimeRoot(`linux-x64-3.11.9-${RL_DASHSCOPE_VERSION}`);
      const { deps, urls } = makeFallbackDeps(root);
      await installRuntime(manifest.entries[0], manifest, root, deps, "linux", {
        [RL_PYTHON_MIRROR_ENV]: "https://mirror.internal/python-build-standalone",
      });
      expect(existsSync(join(root, "READY"))).toBe(true);
      expect(urls[0]).toContain("mirror.internal");
    });
  });
});
