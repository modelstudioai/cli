import {
  defineCommand,
  detectOutputFormat,
  getFineTune,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

const DEFAULT_INTERVAL_SEC = 10;
const MIN_INTERVAL_SEC = 1;
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);
/** SIGINT exit code (128 + signal 2). */
const EXIT_INTERRUPTED = 130;
const EXIT_FAILED = 1;
const EXIT_TIMEOUT = 2;
/** Non-terminal status: the job is still running. Distinct from failure. */
const EXIT_RUNNING = 3;

function nowStamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Exit code for a status value:
 *   SUCCEEDED            -> 0
 *   FAILED / CANCELED    -> 1
 *   anything else        -> 3 (still running)
 */
function exitCodeForStatus(status: string): number {
  if (status === "SUCCEEDED") return 0;
  if (TERMINAL_STATUSES.has(status)) return EXIT_FAILED;
  return EXIT_RUNNING;
}

/**
 * Resolve after `milliseconds`, rejecting early if `signal` aborts (Ctrl-C).
 * Cleans up its timer + listener so nothing leaks between polls.
 */
function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export default defineCommand({
  name: "finetune watch",
  description:
    "Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.",
  usage: "bl finetune watch --job-id <id> [--follow] [--interval <sec>] [--timeout <sec>]",
  options: [
    { flag: "--job-id <id>", description: "Fine-tune job ID (required)", required: true },
    {
      flag: "--follow",
      description:
        "Block and poll until a terminal state (the legacy behavior). Without it, a single status probe is performed and the command returns immediately.",
      type: "boolean",
    },
    {
      flag: "--interval <sec>",
      description: `Seconds between polls with --follow (default: ${DEFAULT_INTERVAL_SEC}, min: ${MIN_INTERVAL_SEC}). Ignored without --follow.`,
      type: "number",
    },
    {
      flag: "--timeout <sec>",
      description:
        "With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.",
      type: "number",
    },
  ],
  examples: [
    "bl finetune watch --job-id ft-xxx                       # single probe, returns immediately",
    "bl finetune watch --job-id ft-xxx --output json        # status probe for agents",
    "bl finetune watch --job-id ft-xxx --follow              # block until terminal",
    "bl finetune watch --job-id ft-xxx --follow --interval 5",
    "bl finetune watch --job-id ft-xxx --follow --timeout 3600",
  ],
  notes: [
    "Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then",
    "return immediately. This is the mode meant for agents / scripts — the caller",
    "owns the polling cadence, so the CLI never holds the terminal.",
    "Exit codes (both modes): 0 SUCCEEDED | 1 FAILED/CANCELED | 2 --follow timeout",
    "| 3 still running (non-terminal, default mode) | 130 interrupted (Ctrl-C).",
    "Use --follow for the blocking, human-terminal-follow experience; use the",
    "default mode when driving the loop yourself (e.g. from an agent).",
    "For per-step training output (not status), use `bl finetune logs`.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const jobId = flags.jobId as string | undefined;
    if (!jobId) failIfMissing("job-id", "bl finetune watch --job-id <id>");

    const follow = Boolean(flags.follow);
    const intervalSec = Math.max(
      MIN_INTERVAL_SEC,
      flags.interval !== undefined ? (flags.interval as number) : DEFAULT_INTERVAL_SEC,
    );
    const timeoutSec = flags.timeout !== undefined ? (flags.timeout as number) : undefined;
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult(
        {
          action: "finetune.watch",
          job_id: jobId,
          follow,
          interval: intervalSec,
          timeout: timeoutSec,
        },
        format,
      );
      return;
    }

    // ---- Default: non-blocking single status probe -------------------------
    if (!follow) {
      const response = await getFineTune(config, jobId!);
      const job = response.output ?? response.data;
      const status = String(job?.status ?? "").toUpperCase();
      const terminal = TERMINAL_STATUSES.has(status);
      const code = exitCodeForStatus(status);

      if (config.quiet) {
        // Just the status word — ideal for `status=$(bl finetune watch ... --quiet)`.
        emitBare(status || "UNKNOWN");
      } else if (format === "text") {
        emitBare(`${nowStamp()}  ${jobId}  ${status || "UNKNOWN"}`);
        if (terminal) {
          const mark = status === "SUCCEEDED" ? "✓" : "✗";
          emitBare(`${mark} ${jobId}  ${status}`);
        }
      } else {
        // json / yaml: a compact, purpose-built status probe.
        emitResult({ job_id: jobId, status: status || "UNKNOWN", terminal }, format);
      }
      process.exit(code);
    }

    // ---- --follow: blocking poll loop (legacy behavior) -------------------
    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.on("SIGINT", onSigint);

    try {
      let lastStatus = "";
      const startedAt = Date.now();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response = await getFineTune(config, jobId!, controller.signal);
        const job = response.output ?? response.data;
        const status = String(job?.status ?? "").toUpperCase();

        if (format === "text" && !config.quiet && status !== lastStatus) {
          emitBare(`${nowStamp()}  ${jobId}  ${status || "UNKNOWN"}`);
          lastStatus = status;
        }

        if (TERMINAL_STATUSES.has(status)) {
          const elapsed = Date.now() - startedAt;
          if (format !== "text" || config.quiet) {
            emitResult(response, format);
          } else {
            const mark = status === "SUCCEEDED" ? "✓" : "✗";
            emitBare(`\n${mark} ${jobId}  ${status}  (elapsed ${formatElapsed(elapsed)})`);
          }
          process.exit(exitCodeForStatus(status));
        }

        if (timeoutSec !== undefined && (Date.now() - startedAt) / 1000 >= timeoutSec) {
          if (format === "text" && !config.quiet) {
            emitBare(
              `\n⏼ ${jobId}  timed out after ${formatElapsed(Date.now() - startedAt)} (last status: ${status || "UNKNOWN"})`,
            );
          }
          process.exit(EXIT_TIMEOUT);
        }

        await sleep(intervalSec * 1000, controller.signal);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        emitBare("\nInterrupted.");
        process.exit(EXIT_INTERRUPTED);
      }
      throw error;
    } finally {
      process.off("SIGINT", onSigint);
    }
  },
});
