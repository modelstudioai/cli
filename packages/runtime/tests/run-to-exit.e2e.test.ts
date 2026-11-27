import { execFile, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const harness = join(runtimeRoot, "tests/harness/run-to-exit-main.ts");
const bun = process.env.BAILIAN_TEST_BUN ?? "bun";
const hasBun = spawnSync(bun, ["--version"], { stdio: "ignore" }).status === 0;
const payloadBytes = 2_000_000;

function harnessArgs(runtime: string, ...args: string[]): { command: string; args: string[] } {
  if (runtime === "node") {
    return {
      command: process.execPath,
      args: ["--import", import.meta.resolve("tsx"), harness, ...args],
    };
  }
  return { command: bun, args: [harness, ...args] };
}

describe.each(["node", ...(hasBun ? ["bun"] : [])])(
  "runToExit large piped stdout (%s)",
  (runtime) => {
    test("delivers the full JSON payload and exits promptly", async () => {
      const startedAt = performance.now();
      const invocation = harnessArgs(runtime, String(payloadBytes), "0", "60000");
      const { stdout, stderr } = await execFileAsync(invocation.command, invocation.args, {
        cwd: runtimeRoot,
        // execFile pipes stdout by default; this is the Bun truncation scenario.
        timeout: 15_000,
        maxBuffer: payloadBytes + 64_000,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          DO_NOT_TRACK: "1",
          NO_UPDATE_NOTIFIER: "1",
        },
      });
      const elapsedMs = performance.now() - startedAt;
      expect(stderr).toBe("");
      const parsed = JSON.parse(stdout) as { data: string };
      expect(parsed.data.length).toBe(payloadBytes);
      expect(elapsedMs).toBeLessThan(10_000);
    });

    test("preserves a non-zero process.exitCode", async () => {
      const invocation = harnessArgs(runtime, "16", "3", "0");
      const error = await execFileAsync(invocation.command, invocation.args, {
        cwd: runtimeRoot,
        timeout: 10_000,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          DO_NOT_TRACK: "1",
          NO_UPDATE_NOTIFIER: "1",
        },
      }).then(
        () => undefined,
        (failure: NodeJS.ErrnoException & { code?: number; stdout?: string }) => failure,
      );
      expect(error).toBeDefined();
      expect(error?.code).toBe(3);
      const parsed = JSON.parse(String(error?.stdout ?? "")) as { data: string };
      expect(parsed.data.length).toBe(16);
    });

    test("keeps the full payload when the reader is idle for more than 5s", async () => {
      const invocation = harnessArgs(runtime, String(payloadBytes), "0", "0");
      // Delay the pipe consumer for >5s so a hard flush timeout would truncate.
      const delayedReader = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
import { setTimeout as sleep } from "node:timers/promises";
await sleep(7000);
let chunks = "";
for await (const chunk of process.stdin) chunks += chunk;
process.stdout.write(chunks);
`,
        ],
        {
          cwd: runtimeRoot,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
        },
      );
      const producer = spawn(invocation.command, invocation.args, {
        cwd: runtimeRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          DO_NOT_TRACK: "1",
          NO_UPDATE_NOTIFIER: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      producer.stdout?.pipe(delayedReader.stdin!);
      const stderrChunks: Buffer[] = [];
      producer.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      const stdoutChunks: Buffer[] = [];
      delayedReader.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      const [[producerCode], [readerCode]] = await Promise.all([
        once(producer as unknown as NodeJS.EventEmitter, "close") as Promise<[number | null]>,
        once(delayedReader as unknown as NodeJS.EventEmitter, "close") as Promise<[number | null]>,
      ]);
      expect(producerCode).toBe(0);
      expect(readerCode).toBe(0);
      expect(Buffer.concat(stderrChunks).toString("utf8")).toBe("");
      const parsed = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8")) as { data: string };
      expect(parsed.data.length).toBe(payloadBytes);
    }, 25_000);
  },
);
