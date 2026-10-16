/* eslint-disable typescript/unbound-method -- Capture and restore method identity; never call the saved methods unbound. */
import type { EventEmitter } from "node:events";
import type { RunCliResult } from "./run-subprocess.ts";

let captureQueue: Promise<unknown> = Promise.resolve();

interface CaptureOptions {
  cwd?: string;
  /** Full child env (execFile-style replace). Omit to inherit process.env. */
  env?: NodeJS.ProcessEnv;
  entrypoint?: string;
}

class CapturedExit extends Error {}

function restoreListeners(
  emitter: EventEmitter,
  event: string,
  listeners: ReturnType<EventEmitter["rawListeners"]>,
): void {
  emitter.removeAllListeners(event);
  for (const listener of listeners) emitter.on(event, listener);
}

function replaceProcessEnv(next: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(process.env)) delete process.env[name];
  for (const [name, value] of Object.entries(next)) {
    if (value !== undefined) process.env[name] = value;
  }
}

async function capture(
  run: () => void | Promise<void>,
  args: string[],
  options: CaptureOptions,
): Promise<RunCliResult> {
  const originalCwd = process.cwd();
  const originalArgv = process.argv;
  const originalEnvironment = { ...process.env };
  const originalExit = process.exit;
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const interruptListeners = process.rawListeners("SIGINT");
  const errorListeners = process.stdout.rawListeners("error");
  const streams = [process.stdin, process.stdout, process.stderr];
  const terminalProperties = streams.flatMap((stream) =>
    ["isTTY", "columns", "rows"].map((property) => ({
      stream,
      property,
      descriptor: Object.getOwnPropertyDescriptor(stream, property),
    })),
  );
  const exitSignal = new CapturedExit("Captured CLI exit");
  let stdout = "";
  let stderr = "";
  let exitCode: number | undefined;

  function writer(destination: "stdout" | "stderr"): typeof process.stdout.write {
    return ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error) => void),
      callback?: (error?: Error) => void,
    ) => {
      if (exitCode === undefined) {
        const text =
          typeof chunk === "string"
            ? chunk
            : Buffer.from(chunk).toString(
                typeof encodingOrCallback === "string" ? encodingOrCallback : undefined,
              );
        if (destination === "stdout") stdout += text;
        else stderr += text;
      }
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (done) queueMicrotask(() => done());
      return true;
    }) as typeof process.stdout.write;
  }

  try {
    if (options.cwd) process.chdir(options.cwd);
    if (options.env) replaceProcessEnv(options.env);
    Object.assign(process.env, { NODE_NO_WARNINGS: "1", DO_NOT_TRACK: "1" });
    process.argv = [process.execPath, options.entrypoint ?? "commands-e2e", ...args];
    process.exitCode = 0;
    for (const { stream, property } of terminalProperties)
      Object.defineProperty(stream, property, {
        configurable: true,
        writable: true,
        value: property === "isTTY" ? false : undefined,
      });
    process.stdout.write = writer("stdout");
    process.stderr.write = writer("stderr");
    process.exit = ((code?: number | string | null) => {
      exitCode ??= Number(code ?? process.exitCode ?? 0);
      throw exitSignal;
    }) as typeof process.exit;
    try {
      await run();
    } catch (error) {
      if (error !== exitSignal) throw error;
    }
    return { stdout, stderr, exitCode: exitCode ?? Number(process.exitCode ?? 0) };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exit = originalExit;
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
    replaceProcessEnv(originalEnvironment);
    for (const { stream, property, descriptor } of terminalProperties) {
      if (descriptor) Object.defineProperty(stream, property, descriptor);
      else Reflect.deleteProperty(stream, property);
    }
    restoreListeners(process, "SIGINT", interruptListeners);
    restoreListeners(process.stdout, "error", errorListeners);
    if (process.cwd() !== originalCwd) process.chdir(originalCwd);
  }
}

/** Explicitly opted-in offline CLI cases; captures are serialized within a worker. */
export function runInProcess(
  run: () => void | Promise<void>,
  args: string[],
  options: CaptureOptions = {},
): Promise<RunCliResult> {
  const pending = captureQueue.then(() => capture(run, args, options));
  captureQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}
