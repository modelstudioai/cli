import { afterEach, expect, test, vi } from "vite-plus/test";
import { runToExit, type Cli } from "../src/create-cli.ts";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

test("runToExit exits with code 0 after run resolves", async () => {
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as typeof process.exit);
  const run = vi.fn(async () => undefined);
  const cli: Cli = { run };
  await runToExit(cli);
  expect(run).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledWith(0);
});

test("runToExit keeps an exit code set during run", async () => {
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as typeof process.exit);
  const cli: Cli = {
    async run() {
      process.exitCode = 3;
    },
  };
  await runToExit(cli);
  expect(exit).toHaveBeenCalledWith(3);
});

test("runToExit does not exit while run is still pending", async () => {
  const exit = vi
    .spyOn(process, "exit")
    .mockImplementation((() => undefined) as typeof process.exit);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cli: Cli = {
    async run() {
      await gate;
    },
  };
  const pending = runToExit(cli);
  await Promise.resolve();
  expect(exit).not.toHaveBeenCalled();
  release();
  await pending;
  expect(exit).toHaveBeenCalledWith(0);
});
