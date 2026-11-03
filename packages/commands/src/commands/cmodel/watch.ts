import {
  BailianError,
  ExitCode,
  defineCommand,
  getCustomModelImport,
  type FlagsDef,
} from "bailian-cli-core";

import {
  IMPORT_JOB_ID_FLAGS,
  IMPORT_TERMINAL_STATUSES,
  buildImportJobOutput,
  formatImportFailure,
  PUBLIC_DASHSCOPE_NOTE,
  sleepWithSignal,
} from "./shared.ts";

const DEFAULT_INTERVAL_SEC = 10;
const MIN_INTERVAL_SEC = 1;

const WATCH_FLAGS = {
  ...IMPORT_JOB_ID_FLAGS,
  follow: {
    type: "switch",
    description: {
      "en-US":
        "Block and poll until a terminal state. Without it, a single status probe is performed and the command returns immediately.",
      "zh-CN": "阻塞并轮询至终态。不使用时仅查询一次状态并立即返回。",
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

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US":
      "Probe a custom model's import status (default: single non-blocking fetch). Pass --follow to poll until terminal.",
    "zh-CN": "查询自定义模型的导入状态（默认：单次非阻塞获取）。使用 --follow 持续轮询至终态。",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]",
  flags: WATCH_FLAGS,
  exampleArgs: [
    "--job-id 937b-xxxx",
    "--job-id 937b-xxxx --output json",
    "--job-id 937b-xxxx --follow",
    "--job-id 937b-xxxx --follow --interval 5 --poll-timeout 3600",
  ],
  notes: [
    PUBLIC_DASHSCOPE_NOTE,
    {
      "en-US":
        "Default (no --follow) is a NON-BLOCKING single status probe for agents/scripts. Terminal statuses are SUCCESSED and FAILED; an unknown server status is surfaced verbatim and treated as non-terminal.",
      "zh-CN":
        "默认不使用 --follow，执行非阻塞的单次状态查询，适合 Agent/脚本。终态为 SUCCESSED 和 FAILED；未知服务端状态原样透出并按非终态处理。",
    },
    {
      "en-US":
        "A terminal FAILED status raises a normal CLI error (non-zero exit) with the server error_code preserved; SUCCEEDED and still-running statuses return 0. With --follow, exceeding --poll-timeout raises a timeout error.",
      "zh-CN":
        "终态 FAILED 会触发普通 CLI 错误（非零退出码）并保留服务端 error_code；SUCCEEDED 或仍在运行时返回 0。使用 --follow 时，超过 --poll-timeout 会触发超时错误。",
    },
  ],
  validate(flags) {
    if (flags.interval !== undefined && (!Number.isFinite(flags.interval) || flags.interval < 1)) {
      return "--interval must be at least 1 second. / --interval 必须至少为 1 秒。";
    }
    if (
      flags.pollTimeout !== undefined &&
      (!Number.isFinite(flags.pollTimeout) || flags.pollTimeout < 1)
    ) {
      return "--poll-timeout must be at least 1 second. / --poll-timeout 必须至少为 1 秒。";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const follow = flags.follow;
    const intervalSec = Math.max(MIN_INTERVAL_SEC, flags.interval ?? DEFAULT_INTERVAL_SEC);
    const pollTimeoutSec = flags.pollTimeout;

    if (settings.dryRun) {
      const resultData = {
        action: "cmodel.watch",
        job_id: jobId,
        follow,
        interval: intervalSec,
        timeout: pollTimeoutSec,
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    if (!follow) {
      const response = await getCustomModelImport(ctx.client, jobId);
      const job = response.output ?? response.data;
      const status = String(job?.status ?? "").toUpperCase();
      const terminal = IMPORT_TERMINAL_STATUSES.has(status);
      const resultData = job
        ? { ...buildImportJobOutput(job, jobId), terminal, request_id: response.request_id }
        : {
            job_id: jobId,
            status: "UNKNOWN",
            terminal,
            request_id: response.request_id,
          };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      if (terminal && status !== "SUCCESSED") {
        throw formatImportFailure(jobId, job?.status ?? status, job?.error_code);
      }
      return;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.on("SIGINT", onSigint);

    try {
      let lastStatus = "";
      const startedAt = Date.now();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response = await getCustomModelImport(ctx.client, jobId, controller.signal);
        const job = response.output ?? response.data;
        const rawStatus = String(job?.status ?? "");
        const status = rawStatus.toUpperCase();

        if (status !== lastStatus) {
          ctx.output.progress({
            "en-US": `${jobId}  ${rawStatus || "UNKNOWN"}`,
            "zh-CN": `${jobId}  ${rawStatus || "UNKNOWN"}`,
          });
          lastStatus = status;
        }

        if (IMPORT_TERMINAL_STATUSES.has(status)) {
          const resultData = {
            ...(job ? buildImportJobOutput(job, jobId) : { job_id: jobId }),
            request_id: response.request_id,
          };
          ctx.output.result(
            resultData,
            ctx.settings.output === "text"
              ? { text: JSON.stringify(resultData, null, 2) }
              : undefined,
          );
          if (status !== "SUCCESSED") {
            throw formatImportFailure(jobId, rawStatus, job?.error_code);
          }
          return;
        }

        if (pollTimeoutSec !== undefined && (Date.now() - startedAt) / 1000 >= pollTimeoutSec) {
          throw new BailianError(
            `Watching import job ${jobId} timed out after ${formatElapsed(
              Date.now() - startedAt,
            )} (last status: ${rawStatus || "UNKNOWN"}). / 跟踪导入任务 ${jobId} 超时（耗时 ${formatElapsed(
              Date.now() - startedAt,
            )}，最后状态：${rawStatus || "UNKNOWN"}）。`,
            ExitCode.TIMEOUT,
          );
        }

        await sleepWithSignal(intervalSec * 1000, controller.signal);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        ctx.output.info({ "en-US": "Interrupted.", "zh-CN": "已中断。" });
        return;
      }
      throw error;
    } finally {
      process.off("SIGINT", onSigint);
    }
  },
});
