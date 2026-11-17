import { describe, expect, test } from "vite-plus/test";
import {
  assertDoctorPassed,
  BailianError,
  createWindowsAdapter,
  runRuntimeDoctor,
  type IDoctorCheck,
  type IDoctorReport,
} from "../src/index.ts";

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
    // 代理拒无关域名是回环真实断言，离线仍可验证。
    const proxyDeny = result.checks.find((check) => check.name === "proxy-denies-unrelated-domain");
    expect(proxyDeny?.status).toBe("pass");
    // 无运行时：运行时相关必过项 skip（不当通过）。
    const python = result.checks.find((check) => check.name === "python-version");
    expect(python?.status).toBe("skip");
    const fcPypiLib = result.checks.find((check) => check.name === "fc-pypi-lib-injected");
    expect(fcPypiLib?.required).toBe(true);
    expect(fcPypiLib?.status).toBe("skip");
  });
});
