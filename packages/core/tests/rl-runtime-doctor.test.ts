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

// 回归：taskDir 随 executeIsolatedRun 单次调用消费（finally 无条件销毁），
// doctor 多探针必须各自创建 layout。旧实现共享一个 layout，第二个探针的
// prepare 向已销毁目录写 profile.sb 而 ENOENT。这里用 prepare 写 marker 的
// fake adapter 模拟 darwin 写 profile.sb；pythonPath 用 node stand-in（探针
// 语义由真实运行时 doctor 覆盖，本用例只断言多探针生命周期编排）。
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
      // 5 个探针各 prepare 一次且目录互不相同；共享 layout 时第二次 prepare
      // 即 ENOENT，落入 sandbox-self-check fail 并丢失后续探针。
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
