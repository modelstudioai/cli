import {
  defineCommand,
  detectOutputFormat,
  getFineTune,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

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
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
  follow: {
    type: "switch",
    description: {
      "en-US":
        "Block and poll until a terminal state (the legacy behavior). Without it, a single status probe is performed and the command returns immediately.",
      "zh-CN": "阻塞并轮询至终态（旧版行为）。不使用时仅查询一次状态并立即返回。",
    },
  },
  interval: {
    type: "number",
    valueHint: "<sec>",
    description: {
      "en-US": `Seconds between polls with --follow (default: ${DEFAULT_INTERVAL_SEC}, min: ${MIN_INTERVAL_SEC}). Ignored without --follow.`,
      "zh-CN": `使用 --follow 时的轮询间隔秒数（默认：${DEFAULT_INTERVAL_SEC}，最小：${MIN_INTERVAL_SEC}）。未使用 --follow 时忽略。`,
    },
  },
  pollTimeout: {
    type: "number",
    valueHint: "<sec>",
    description: {
      "en-US":
        "With --follow, stop polling after this many seconds (default: no limit). Ignored without --follow.",
      "zh-CN": "使用 --follow 时，在指定秒数后停止轮询（默认：无限制）。未使用 --follow 时忽略。",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US":
      "Probe a fine-tune job's status (default: single non-blocking fetch). Pass --follow to poll until terminal.",
    "zh-CN": "查询微调任务状态（默认：单次非阻塞获取）。使用 --follow 持续轮询至终态。",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]",
  flags: WATCH_FLAGS,
  exampleArgs: [
    {
      "en-US": "--job-id ft-xxx                       # single probe, returns immediately",
      "zh-CN": "--job-id ft-xxx                       # 单次查询，立即返回",
    },
    {
      "en-US": "--job-id ft-xxx --output json        # status probe for agents",
      "zh-CN": "--job-id ft-xxx --output json        # 供智能体查询状态",
    },
    {
      "en-US": "--job-id ft-xxx --follow              # block until terminal",
      "zh-CN": "--job-id ft-xxx --follow              # 阻塞等待至终态",
    },
    "--job-id ft-xxx --follow --interval 5",
    "--job-id ft-xxx --follow --poll-timeout 3600",
  ],
  notes: [
    {
      "en-US":
        "Default (no --follow) is a NON-BLOCKING single status probe: one fetch, then return immediately. This is the mode meant for agents / scripts — the caller owns the polling cadence, so the CLI never holds the terminal.",
      "zh-CN":
        "默认不使用 --follow，执行非阻塞的单次状态查询：获取一次后立即返回。该模式适用于 Agent / 脚本，由调用方控制轮询节奏，CLI 不会持续占用终端。",
    },
    {
      "en-US":
        "A terminal FAILED/CANCELED status raises a normal CLI error (non-zero exit); a SUCCEEDED or still-running status returns 0. With --follow, exceeding --poll-timeout raises a timeout error.",
      "zh-CN":
        "终态 FAILED/CANCELED 会触发普通 CLI 错误（非零退出码）；SUCCEEDED 或仍在运行时返回 0。使用 --follow 时，超过 --poll-timeout 会触发超时错误。",
    },
    {
      "en-US":
        "Use --follow for the blocking, human-terminal-follow experience; use the default mode when driving the loop yourself (e.g. from an agent).",
      "zh-CN":
        "需要在人工终端中阻塞跟踪时使用 --follow；自行驱动轮询（例如通过 Agent）时使用默认模式。",
    },
    {
      "en-US": "For per-step training output (not status), use `finetune logs`.",
      "zh-CN": "要查看逐步骤训练输出（而非状态），请使用 `finetune logs`。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const follow = flags.follow;
    const intervalSec = Math.max(MIN_INTERVAL_SEC, flags.interval ?? DEFAULT_INTERVAL_SEC);
    const pollTimeoutSec = flags.pollTimeout;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          action: "finetune.watch",
          job_id: jobId,
          follow,
          interval: intervalSec,
          timeout: pollTimeoutSec,
        },
        format,
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
      } else if (format === "text") {
        emitBare(`${nowStamp()}  ${jobId}  ${status || "UNKNOWN"}`);
        if (status === "SUCCEEDED") emitBare(`✓ ${jobId}  ${status}`);
        emitRequestId(response.request_id, settings.quiet);
      } else {
        // json: a compact, purpose-built status probe.
        emitResult(
          { job_id: jobId, status: status || "UNKNOWN", terminal, request_id: response.request_id },
          format,
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

        if (format === "text" && !settings.quiet && status !== lastStatus) {
          emitBare(`${nowStamp()}  ${jobId}  ${status || "UNKNOWN"}`);
          lastStatus = status;
        }

        if (TERMINAL_STATUSES.has(status)) {
          const elapsed = Date.now() - startedAt;
          if (format !== "text" || settings.quiet) {
            emitResult(response, format);
          } else if (status === "SUCCEEDED") {
            emitBare(`\n✓ ${jobId}  ${status}  (elapsed ${formatElapsed(elapsed)})`);
            emitRequestId(response.request_id, settings.quiet);
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
        emitBare("\nInterrupted.");
        return;
      }
      throw error;
    } finally {
      process.off("SIGINT", onSigint);
    }
  },
});
