import { execFile, spawnSync } from "node:child_process";
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

describe.each(["node", ...(hasBun ? ["bun"] : [])])(
  "runToExit large piped stdout (%s)",
  (runtime) => {
    test("delivers the full JSON payload and exits promptly", async () => {
      const startedAt = performance.now();
      const { stdout, stderr } = await execFileAsync(
        runtime === "node" ? process.execPath : bun,
        [
          ...(runtime === "node" ? ["--import", import.meta.resolve("tsx")] : []),
          harness,
          String(payloadBytes),
          "0",
          "60000",
        ],
        {
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
        },
      );
      const elapsedMs = performance.now() - startedAt;
      expect(stderr).toBe("");
      const parsed = JSON.parse(stdout) as { data: string };
      expect(parsed.data.length).toBe(payloadBytes);
      expect(elapsedMs).toBeLessThan(10_000);
    });

    test("preserves a non-zero process.exitCode", async () => {
      const error = await execFileAsync(
        runtime === "node" ? process.execPath : bun,
        [
          ...(runtime === "node" ? ["--import", import.meta.resolve("tsx")] : []),
          harness,
          "16",
          "3",
          "0",
        ],
        {
          cwd: runtimeRoot,
          timeout: 10_000,
          env: {
            ...process.env,
            NODE_NO_WARNINGS: "1",
            DO_NOT_TRACK: "1",
            NO_UPDATE_NOTIFIER: "1",
          },
        },
      ).then(
        () => undefined,
        (failure: NodeJS.ErrnoException & { code?: number; stdout?: string }) => failure,
      );
      expect(error).toBeDefined();
      expect(error?.code).toBe(3);
      const parsed = JSON.parse(String(error?.stdout ?? "")) as { data: string };
      expect(parsed.data.length).toBe(16);
    });
  },
);
