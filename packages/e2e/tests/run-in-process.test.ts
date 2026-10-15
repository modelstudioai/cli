/* eslint-disable typescript/unbound-method -- Capture and restore method identity; never call the saved methods unbound. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { buildIsolatedCliEnv } from "../src/isolation.ts";
import { runInProcess } from "../src/run-in-process.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function makeDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "bl-process-capture-"));
  directories.push(directory);
  return directory;
}

test("captures stdout and stderr separately, including byte writes and callbacks", async () => {
  let callbackCalled = false;
  const result = await runInProcess(async () => {
    process.stdout.write(Buffer.from("output"), () => {
      callbackCalled = true;
    });
    process.stderr.write("error\n");
    await Promise.resolve();
  }, []);
  expect(result).toEqual({ stdout: "output", stderr: "error\n", exitCode: 0 });
  expect(callbackCalled).toBe(true);
});

test("preserves the first exit status and output even when a CLI error boundary catches exit", async () => {
  const result = await runInProcess(async () => {
    process.stderr.write("usage failure\n");
    try {
      process.exit(2);
    } catch {
      process.stderr.write("unreachable error-boundary output");
      process.exit(1);
    }
  }, []);
  expect(result).toEqual({ stdout: "", stderr: "usage failure\n", exitCode: 2 });
});

test("uses child-style argv, cwd, environment and non-TTY streams, then restores them", async () => {
  const directory = makeDirectory();
  const originalCwd = process.cwd();
  const originalArgv = process.argv;
  const originalMarker = process.env.IN_PROCESS_TEST_MARKER;
  const originalHostLeak = process.env.IN_PROCESS_HOST_LEAK;
  const originalWrite = process.stdout.write;
  const originalExit = process.exit;
  process.env.IN_PROCESS_HOST_LEAK = "should-not-inherit";
  try {
    const result = await runInProcess(
      () => {
        process.stdout.write(
          JSON.stringify({
            cwd: process.cwd(),
            args: process.argv.slice(2),
            marker: process.env.IN_PROCESS_TEST_MARKER,
            hostLeak: process.env.IN_PROCESS_HOST_LEAK ?? null,
            tracked: process.env.DO_NOT_TRACK,
            stdoutTty: process.stdout.isTTY,
            stdinTty: process.stdin.isTTY,
          }),
        );
        process.env.CREATED_BY_CAPTURE_TEST = "temporary";
      },
      ["--output", "json"],
      { cwd: directory, env: { IN_PROCESS_TEST_MARKER: "child" } },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      cwd: realpathSync(directory),
      args: ["--output", "json"],
      marker: "child",
      hostLeak: null,
      tracked: "1",
      stdoutTty: false,
      stdinTty: false,
    });
    expect(process.cwd()).toBe(originalCwd);
    expect(process.argv).toBe(originalArgv);
    expect(process.env.IN_PROCESS_TEST_MARKER).toBe(originalMarker);
    expect(process.env.IN_PROCESS_HOST_LEAK).toBe("should-not-inherit");
    expect(process.env.CREATED_BY_CAPTURE_TEST).toBeUndefined();
    expect(process.stdout.write).toBe(originalWrite);
    expect(process.exit).toBe(originalExit);
  } finally {
    if (originalHostLeak === undefined) delete process.env.IN_PROCESS_HOST_LEAK;
    else process.env.IN_PROCESS_HOST_LEAK = originalHostLeak;
  }
});

test("restores process state when the callback rejects unexpectedly", async () => {
  const originalCwd = process.cwd();
  const originalWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  await expect(
    runInProcess(
      () => {
        process.exitCode = 9;
        throw new Error("fixture rejection");
      },
      [],
      { cwd: makeDirectory() },
    ),
  ).rejects.toThrow("fixture rejection");
  expect(process.cwd()).toBe(originalCwd);
  expect(process.stderr.write).toBe(originalWrite);
  expect(process.exitCode).toBe(originalExitCode);
});

test("buildIsolatedCliEnv + runInProcess clears host Agent override env", async () => {
  const previousCodex = process.env.CODEX_HOME;
  process.env.CODEX_HOME = "/tmp/host-codex-should-not-leak";
  const isolated = buildIsolatedCliEnv();
  try {
    const result = await runInProcess(
      () => {
        process.stdout.write(
          JSON.stringify({
            codex: process.env.CODEX_HOME ?? null,
            skipHost: process.env.BL_SKIP_HOST_AGENTS ?? null,
            configDir: process.env.BAILIAN_CONFIG_DIR ?? null,
          }),
        );
      },
      [],
      { env: isolated.env },
    );
    const body = JSON.parse(result.stdout) as {
      codex: string | null;
      skipHost: string | null;
      configDir: string | null;
    };
    expect(body.codex).toBeNull();
    expect(body.skipHost).toBe("1");
    expect(body.configDir).toBeTruthy();
    expect(process.env.CODEX_HOME).toBe("/tmp/host-codex-should-not-leak");
  } finally {
    isolated.dispose();
    if (previousCodex === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodex;
  }
});

test("serializes overlapping captures without mixing output or environment", async () => {
  const results = await Promise.all(
    ["first", "second"].map((marker) =>
      runInProcess(
        async () => {
          process.stdout.write(process.env.IN_PROCESS_TEST_MARKER!);
          await new Promise((resolve) => setTimeout(resolve, 5));
          process.stdout.write(process.env.IN_PROCESS_TEST_MARKER!);
        },
        [],
        { env: { IN_PROCESS_TEST_MARKER: marker } },
      ),
    ),
  );
  expect(results.map((result) => result.stdout)).toEqual(["firstfirst", "secondsecond"]);
});

test("removes CLI lifecycle listeners without disturbing existing listeners", async () => {
  const originalInterruptListeners = process.rawListeners("SIGINT");
  const originalErrorListeners = process.stdout.rawListeners("error");
  await runInProcess(() => {
    process.on("SIGINT", () => {});
    process.stdout.on("error", () => {});
  }, []);
  expect(process.rawListeners("SIGINT")).toEqual(originalInterruptListeners);
  expect(process.stdout.rawListeners("error")).toEqual(originalErrorListeners);
});
