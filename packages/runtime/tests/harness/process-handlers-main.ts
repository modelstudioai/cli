import { defineCommand } from "bailian-cli-core";
import { createCli } from "../../src/create-cli.ts";

const mode = process.argv[2];
const parallelCalls = 12;
const before = {
  interrupt: process.listenerCount("SIGINT"),
  stdoutError: process.stdout.listenerCount("error"),
};
let releaseCommands!: () => void;
const hold = new Promise<void>((resolve) => {
  releaseCommands = resolve;
});
let reportReady!: () => void;
const ready = new Promise<void>((resolve) => {
  reportReady = resolve;
});
let started = 0;
const command = defineCommand({
  description: "Process handler lifecycle probe",
  auth: "none",
  async run() {
    started++;
    if (started === parallelCalls) reportReady();
    await hold;
  },
});
const options = {
  binName: "test-cli",
  version: "0.0.0",
  clientName: "process-handler-test",
  npmPackage: "process-handler-test",
};
const cli = createCli({ hold: command }, options);
const pending = Promise.all(
  Array.from({ length: parallelCalls }, () =>
    (mode === "separate" ? createCli({ hold: command }, options) : cli).run([
      "hold",
      "--output=json",
      "--quiet",
    ]),
  ),
);
await ready;
const during = {
  interrupt: process.listenerCount("SIGINT"),
  stdoutError: process.stdout.listenerCount("error"),
};
if (mode === "interrupt") {
  process.emit("SIGINT");
} else if (mode === "stdout-error") {
  process.stdout.emit("error", Object.assign(new Error("Mock stdout error"), { code: "EIO" }));
} else {
  releaseCommands();
  await pending;
  // Node warnings are delivered asynchronously; include them in the subprocess capture.
  await new Promise<void>((resolve) => setImmediate(resolve));
  process.stdout.write(
    JSON.stringify({
      before,
      during,
      after: {
        interrupt: process.listenerCount("SIGINT"),
        stdoutError: process.stdout.listenerCount("error"),
      },
    }) + "\n",
  );
}
