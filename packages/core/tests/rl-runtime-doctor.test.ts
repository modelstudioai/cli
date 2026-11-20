import { describe, expect, test } from "vite-plus/test";
import {
  assertDoctorPassed,
  BailianError,
  createWindowsAdapter,
  runRuntimeDoctor,
  type IDoctorCheck,
  type IDoctorReport,
} from "../src/index.ts";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IIsolationAdapter } from "../src/isolation/types.ts";
import { withIsolatedHome } from "./helpers/isolation.ts";

function report(checks: IDoctorCheck[]): IDoctorReport {
  return { checks, ok: checks.every((check) => !check.required || check.status === "pass") };
}

describe("assertDoctorPassed", () => {
  test("passes when every required check passes", () => {
    const ok = report([
      { name: "mechanism", required: true, status: "pass" },
      { name: "memory", required: false, status: "degraded" },
    ]);
    expect(() => assertDoctorPassed(ok)).not.toThrow();
  });

  test("fails on a required fail or skip, ignoring degraded enhancements", () => {
    expect(() =>
      assertDoctorPassed(report([{ name: "mechanism", required: true, status: "fail" }])),
    ).toThrow(BailianError);
    expect(() =>
      assertDoctorPassed(report([{ name: "python", required: true, status: "skip" }])),
    ).toThrow(BailianError);
  });
});

describe("runRuntimeDoctor (win32 fail-closed)", () => {
  test("reports mechanism failure and skips runtime checks without a runtime", async () => {
    const result = await runRuntimeDoctor({
      platform: "win32",
      adapter: createWindowsAdapter(),
    });
    expect(result.ok).toBe(false);
    const mechanism = result.checks.find(
      (check) => check.name === "credential-isolation-mechanism",
    );
    expect(mechanism?.status).toBe("fail");
    expect(mechanism?.detail).toBe("Not supported on Windows yet.");
    // Proxy denying unrelated domains is a real loopback assertion, verifiable offline.
    const proxyDeny = result.checks.find((check) => check.name === "proxy-denies-unrelated-domain");
    expect(proxyDeny?.status).toBe("pass");
    // No runtime: runtime-related required checks are skipped (not treated as passed).
    const python = result.checks.find((check) => check.name === "python-version");
    expect(python?.status).toBe("skip");
    const fcPypiLib = result.checks.find((check) => check.name === "fc-pypi-lib-injected");
    expect(fcPypiLib?.required).toBe(true);
    expect(fcPypiLib?.status).toBe("skip");
    // Host network preflight is off by default (doctor stays usable offline).
    expect(
      result.checks.find((check) => check.name === "host-network-reachability"),
    ).toBeUndefined();
  });
});

describe("runRuntimeDoctor host-network-reachability（注入探针，不真实出站）", () => {
  test("全部可达：增强项 pass，不阻断整体", async () => {
    const result = await runRuntimeDoctor({
      platform: "win32",
      adapter: createWindowsAdapter(),
      checkHostNetwork: true,
      hostNetworkTargets: [{ host: "api.example.test", port: 443 }],
      hostNetworkProbe: async () => undefined,
    });
    const check = result.checks.find((item) => item.name === "host-network-reachability");
    expect(check?.required).toBe(false);
    expect(check?.status).toBe("pass");
    expect(check?.detail).toBeUndefined();
  });

  test("部分被阻断：degraded 并列出主机与 errno 及沙箱指引，不计入必过项", async () => {
    const result = await runRuntimeDoctor({
      platform: "win32",
      adapter: createWindowsAdapter(),
      checkHostNetwork: true,
      hostNetworkTargets: [
        { host: "api.example.test", port: 443 },
        { host: "download.example.test", port: 443 },
      ],
      hostNetworkProbe: async (host) => (host === "download.example.test" ? "EPERM" : undefined),
    });
    const check = result.checks.find((item) => item.name === "host-network-reachability");
    expect(check?.required).toBe(false);
    expect(check?.status).toBe("degraded");
    expect(check?.detail).toContain("download.example.test:443 (EPERM)");
    expect(check?.detail).not.toContain("api.example.test");
    expect(check?.detail).toContain("sandbox");
    expect(check?.detail).toContain("HTTPS_PROXY");
    // Enhanced degradation does not change the required-check verdict.
    expect(() => assertDoctorPassed({ checks: [check!], ok: true })).not.toThrow();
  });
});

// Regression: taskDir is consumed by a single executeIsolatedRun call (destroyed unconditionally in finally),
// so doctor's multiple probes must each create their own layout. The old implementation shared one layout, and the second probe's
// prepare wrote profile.sb into the destroyed directory, hitting ENOENT. Here a fake adapter whose prepare writes a marker
// simulates darwin writing profile.sb; pythonPath uses a node stand-in (probe semantics are covered by the real-runtime doctor,
// this case only asserts multi-probe lifecycle orchestration).
describe("runRuntimeDoctor multi-probe task-dir consumption", () => {
  test("each probe prepares into a fresh task dir and all dirs are disposed", async () => {
    await withIsolatedHome(async (home) => {
      const preparedTaskDirs: string[] = [];
      const markerAdapter: IIsolationAdapter = {
        detect: async () => ({
          credentialDenyRead: { available: true, mechanism: "none" },
          hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
        }),
        prepare: async (spec) => {
          writeFileSync(join(spec.taskDir, "marker.sb"), "(version 1)");
          preparedTaskDirs.push(spec.taskDir);
        },
        wrapCommand: (_spec, command) => command,
        dispose: async () => {},
      };
      const result = await runRuntimeDoctor({
        adapter: markerAdapter,
        runtime: {
          runtimeRoot: process.execPath,
          pythonPath: process.execPath,
          dashscopeVersion: "1.25.23",
          source: "override",
        },
        credentialDenyPaths: [join(home, "real-credential")],
      });
      // Each of the 5 probes prepares once into distinct directories; with a shared layout the second prepare
      // hits ENOENT, falls into sandbox-self-check fail, and loses the remaining probes.
      expect(preparedTaskDirs.length).toBe(5);
      expect(new Set(preparedTaskDirs).size).toBe(5);
      expect(result.checks.find((check) => check.name === "sandbox-self-check")).toBeUndefined();
      for (const name of [
        "python-version",
        "sdk-import",
        "fc-pypi-lib-injected",
        "home-redirect",
        "credential-deny-negative",
      ]) {
        expect(result.checks.some((check) => check.name === name)).toBe(true);
      }
      for (const taskDir of preparedTaskDirs) {
        expect(existsSync(taskDir)).toBe(false);
      }
    });
  });
});
