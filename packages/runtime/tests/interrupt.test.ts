import { expect, test, vi } from "vite-plus/test";
import { createCli, registerInterruptHandler } from "../src/index.ts";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";

// 通过公开运行时接口验证接管/释放，不访问内部注册表。
test("临时 Ctrl-C 处理释放后恢复默认退出 130，释放可重复调用", async () => {
  const isolated = buildIsolatedCliEnv({
    overrides: {
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      NODE_OPTIONS: "",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  try {
    const result = await runInProcess(
      async () => {
        const beforeListeners = process.rawListeners("SIGINT");
        const cli = createCli(
          {
            fixture: {
              auth: "none",
              description: "fixture",
              async run() {
                const listeners = process.rawListeners("SIGINT");
                const handled: string[] = [];
                const release = registerInterruptHandler(() => handled.push("interrupted"));
                const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
                try {
                  process.emit("SIGINT");
                  process.emit("SIGINT");
                  expect(handled).toEqual(["interrupted", "interrupted"]);
                  expect(exit).not.toHaveBeenCalled();
                  release();
                  release();
                  expect(process.rawListeners("SIGINT")).toEqual(listeners);
                  process.emit("SIGINT");
                  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
                  expect(handled).toEqual(["interrupted", "interrupted"]);
                } finally {
                  release();
                  exit.mockRestore();
                }
              },
            },
          },
          {
            binName: "test-cli",
            version: "0.0.0-test",
            npmPackage: "test-cli",
            clientName: "test-client",
          },
        );
        expect(process.rawListeners("SIGINT")).toEqual(beforeListeners);
        await cli.run(["fixture"]);
        expect(process.rawListeners("SIGINT")).toEqual(beforeListeners);
      },
      [],
      { env: isolated.env },
    );
    expect(result.stderr).toContain("Interrupted. Exiting.");
  } finally {
    isolated.dispose();
  }
});

test("第二次 Ctrl-C 在中断刷新期间立即退出", async () => {
  const isolated = buildIsolatedCliEnv({
    overrides: {
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      NODE_OPTIONS: "",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  try {
    await runInProcess(
      async () => {
        const flush = await import("../src/output/flush.ts");
        let releaseFlush!: (timedOut: boolean) => void;
        const flushGate = new Promise<boolean>((resolve) => {
          releaseFlush = resolve;
        });
        // Hold the first interrupt in flush so only the second SIGINT can exit synchronously.
        const flushSpy = vi.spyOn(flush, "flushOutput").mockImplementation(() => flushGate);
        const cli = createCli(
          {
            fixture: {
              auth: "none",
              description: "fixture",
              async run() {
                const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
                try {
                  process.emit("SIGINT");
                  expect(exit).not.toHaveBeenCalled();
                  process.emit("SIGINT");
                  expect(exit).toHaveBeenCalledTimes(1);
                  expect(exit).toHaveBeenCalledWith(130);
                  // Finish the first interrupt chain while exit is still mocked.
                  releaseFlush(false);
                  await vi.waitFor(() => expect(exit.mock.calls.length).toBeGreaterThanOrEqual(2));
                } finally {
                  exit.mockRestore();
                  flushSpy.mockRestore();
                }
              },
            },
          },
          {
            binName: "test-cli",
            version: "0.0.0-test",
            npmPackage: "test-cli",
            clientName: "test-client",
          },
        );
        await cli.run(["fixture"]);
      },
      [],
      { env: isolated.env },
    );
  } finally {
    isolated.dispose();
  }
});
