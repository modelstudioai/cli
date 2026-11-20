import { describe, expect, test } from "vite-plus/test";
import { existsSync } from "node:fs";
import { executeIsolatedRun, type IIsolatedRunInput } from "../src/isolation/app-layer.ts";
import { createTaskDir, type ITaskDirLayout } from "../src/isolation/paths.ts";
import type { IIsolationAdapter } from "../src/isolation/types.ts";
import { withIsolatedHome } from "./helpers/isolation.ts";

// 生命周期断言用 fake adapter（不施加 OS 强制）+ 真实 node 子进程：
// 覆盖 app-layer 的 finally 销毁路径，避免依赖平台沙箱可用性。
const fakeAdapter: IIsolationAdapter = {
  detect: async () => ({
    credentialDenyRead: { available: true, mechanism: "none" },
    hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
  }),
  prepare: async () => {},
  wrapCommand: (_spec, command) => command,
  dispose: async () => {},
};

function baseInput(layout: ITaskDirLayout, command: string[]): IIsolatedRunInput {
  return {
    layout,
    runtimeRoot: process.execPath,
    command,
    apiKey: "sk-lifecycle-test",
    credentialDenyPaths: [],
    timeoutMs: 10_000,
    maxOutputBytes: 1_048_576,
  };
}

describe("executeIsolatedRun task-dir lifecycle", () => {
  test("disposes the task dir after a successful run", async () => {
    await withIsolatedHome(async () => {
      const layout = createTaskDir();
      const result = await executeIsolatedRun(
        baseInput(layout, [process.execPath, "-e", "process.stdout.write('ok')"]),
        fakeAdapter,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("ok");
      expect(existsSync(layout.taskDir)).toBe(false);
    });
  });

  test("disposes the task dir after a failed run (no failure retention)", async () => {
    await withIsolatedHome(async () => {
      const layout = createTaskDir();
      const result = await executeIsolatedRun(
        baseInput(layout, [process.execPath, "-e", "process.exit(3)"]),
        fakeAdapter,
      );
      expect(result.exitCode).toBe(3);
      expect(existsSync(layout.taskDir)).toBe(false);
    });
  });

  test("disposes the task dir after a timeout kill", async () => {
    await withIsolatedHome(async () => {
      const layout = createTaskDir();
      const input = baseInput(layout, [process.execPath, "-e", "setTimeout(() => {}, 5000)"]);
      input.timeoutMs = 300;
      const result = await executeIsolatedRun(input, fakeAdapter);
      expect(result.timedOut).toBe(true);
      expect(existsSync(layout.taskDir)).toBe(false);
    });
  });

  test("fail-closed gate rejects before execution when credential deny is unavailable", async () => {
    await withIsolatedHome(async () => {
      const layout = createTaskDir();
      const unavailableAdapter: IIsolationAdapter = {
        ...fakeAdapter,
        detect: async () => ({
          credentialDenyRead: { available: false, mechanism: "none", reason: "not supported" },
          hardening: { networkEnforce: false, processTree: false, memoryLimit: false },
        }),
      };
      await expect(
        executeIsolatedRun(
          baseInput(layout, [process.execPath, "-e", "process.stdout.write('ok')"]),
          unavailableAdapter,
        ),
      ).rejects.toThrow(/not supported/);
    });
  });
});
