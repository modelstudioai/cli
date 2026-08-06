import {
  defineCommand,
  getFineTune,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DEFAULT_INTERVAL_SEC = 10;
const MIN_INTERVAL_SEC = 1;
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

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

const WATCH_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
  follow: {
    type: "switch",
    description:
      "Block and poll until a terminal state (the legacy behavior). Without it, a single status probe is performed and the command returns immediately.",
  },
  interval: {
    type: "number",
    valueHint: "<sec>",
    description: `Seconds between polls with --follow (default: ${DEFAULT_INTERVAL_SEC}, min: ${MIN_INTERVAL_SEC}). Ignored without --follow.`,
  },
  pollTimeout: {
    type: "number",
    valueHint: "<sec>",
    description:
      "With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.",
  },
} satisfies FlagsDef;

export default defineCommand({
  description:
    "Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.",
  auth: "apiKey",
  usageArgs: "--job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]",
  flags: WATCH_FLAGS,
  exampleArgs: [
    "--job-id ft-xxx                       # single probe, returns immediately",
    "--job-id ft-xxx --output json        # status probe for agents",
    "--job-id ft-xxx --follow              # block until terminal",
    "--job-id ft-xxx --follow --interval 5",
    "--job-id ft-xxx --follow --poll-timeout 3600",
  ],
  notes: [
    "Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then",
    "return immediately. This is the mode meant for agents / scripts — the caller",
    "owns the polling cadence, so the CLI never holds the terminal.",
    "A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit);",
    "a SUCCEEDED or still-running status returns 0. With --follow, exceeding",
    "--poll-timeout raises a timeout error.",
    "Use --follow for the blocking, human-terminal-follow experience; use the",
    "default mode when driving the loop yourself (e.g. from an agent).",
    "For per-step training output (not status), use `finetune logs`.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const follow = flags.follow;
    const intervalSec = Math.max(MIN_INTERVAL_SEC, flags.interval ?? DEFAULT_INTERVAL_SEC);
    const pollTimeoutSec = flags.pollTimeout;

    if (settings.dryRun) {
      emitResult(
        {
          action: "finetune.watch",
          job_id: jobId,
          follow,
          interval: intervalSec,
          timeout: pollTimeoutSec,
        },
        "json",
      );
      return;
    }

    // ---- Default: non-blocking single status probe -------------------------
    // A terminal FAILED/CANCELED status is surfaced as a BailianError (the
    // central handler prints it and exits non-zero); SUCCEEDED and still-running
    // both return normally. No process.exit / custom exit-code contract.
    if (!follow) {
      const response = await getFineTune(ctx.client, jobId);
      const job = response.output ?? response.data;
      const status = String(job?.status ?? "").toUpperCase();
      const terminal = TERMINAL_STATUSES.has(status);

      if (settings.quiet) {
        // Just the status word — ideal for `status=$(... finetune watch ... --quiet)`.
        emitBare(status || "UNKNOWN");
      } else {
        emitResult(
          { job_id: jobId, status: status || "UNKNOWN", terminal, request_id: response.request_id },
          "json",
        );
      }

      if (terminal && status !== "SUCCEEDED") {
        throw new BailianError(
          `Fine-tune job ${jobId} ended in status ${status}.`,
          ExitCode.GENERAL,
        );
      }
      return;
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
        const response = await getFineTune(ctx.client, jobId, controller.signal);
        const job = response.output ?? response.data;
        const status = String(job?.status ?? "").toUpperCase();

        if (!settings.quiet && status !== lastStatus) {
          process.stderr.write(`${nowStamp()}  ${jobId}  ${status || "UNKNOWN"}\n`);
          lastStatus = status;
        }

        if (TERMINAL_STATUSES.has(status)) {
          const elapsed = Date.now() - startedAt;
          if (settings.quiet) {
            emitBare(status || "UNKNOWN");
          } else {
            emitResult(response, "json");
          }
          if (status !== "SUCCEEDED") {
            throw new BailianError(
              `Fine-tune job ${jobId} ended in status ${status} (elapsed ${formatElapsed(elapsed)}).`,
              ExitCode.GENERAL,
            );
          }
          return;
        }

        if (pollTimeoutSec !== undefined && (Date.now() - startedAt) / 1000 >= pollTimeoutSec) {
          throw new BailianError(
            `Watching fine-tune job ${jobId} timed out after ` +
              `${formatElapsed(Date.now() - startedAt)} (last status: ${status || "UNKNOWN"}).`,
            ExitCode.TIMEOUT,
          );
        }

        await sleep(intervalSec * 1000, controller.signal);
      }
    } catch (error) {
      // Ctrl-C aborts the poll loop: report and return normally (no custom code).
      // Any other error (including the BailianError thrown above) propagates to
      // the central handler.
      if (controller.signal.aborted) {
        process.stderr.write("\nInterrupted.\n");
        return;
      }
      throw error;
    } finally {
      process.off("SIGINT", onSigint);
    }
  },
});
