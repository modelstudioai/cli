import { afterEach, expect, test, vi } from "vite-plus/test";
import { runToExit } from "../src/index.ts";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

function stubExit() {
  return vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
}

test("runToExit exits with code 0 once run() resolves", async () => {
  const exit = stubExit();
  process.exitCode = undefined;
  const events: string[] = [];
  const run = vi.fn(async () => {
    events.push("run");
  });
  exit.mockImplementation((() => {
    events.push("exit");
  }) as never);

  await runToExit({ run }, ["x"]);

  expect(run).toHaveBeenCalledWith(["x"]);
  expect(events).toEqual(["run", "exit"]);
  expect(exit).toHaveBeenCalledWith(0);
});

test("runToExit keeps the exit code the run set", async () => {
  const exit = stubExit();
  await runToExit({
    async run() {
      process.exitCode = 3;
    },
  });

  expect(exit).toHaveBeenCalledWith(3);
});

test("runToExit does not exit while run() is still pending", async () => {
  const exit = stubExit();
  let finish!: () => void;
  const pending = runToExit({ run: () => new Promise<void>((resolve) => (finish = resolve)) });

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(exit).not.toHaveBeenCalled();

  finish();
  await pending;
  expect(exit).toHaveBeenCalledTimes(1);
});
