import {
  BailianError,
  ExitCode,
  defineCommand,
  getCompressJob,
  type FlagsDef,
} from "bailian-cli-core";

import {
  COMPRESS_JOB_ID_FLAGS,
  COMPRESS_TERMINAL_STATUSES,
  formatCompressFailure,
  sleepWithSignal,
} from "./compress-shared.ts";

const DEFAULT_INTERVAL_SEC = 10;
const WATCH_FLAGS = {
  ...COMPRESS_JOB_ID_FLAGS,
  follow: {
    type: "switch",
    description: {
      "en-US": "Poll until the job reaches a terminal state",
      "zh-CN": "持续轮询直至任务进入终态",
    },
  },
  interval: {
    type: "number",
    valueHint: "<sec>",
    description: {
      "en-US": "Polling interval with --follow (default: 10, min: 1)",
      "zh-CN": "使用 --follow 时的轮询间隔（默认：10，最小：1）",
    },
  },
  pollTimeout: {
    type: "number",
    valueHint: "<sec>",
    description: {
      "en-US": "Stop polling after this many seconds",
      "zh-CN": "在指定秒数后停止轮询",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Probe or follow a compression job's status",
    "zh-CN": "查询或持续跟踪压缩任务状态",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id> [--follow] [--interval <sec>] [--poll-timeout <sec>]",
  flags: WATCH_FLAGS,
  validate(flags) {
    if (flags.interval !== undefined && (!Number.isFinite(flags.interval) || flags.interval < 1))
      return "--interval must be at least 1 second. / --interval 必须至少为 1 秒。";
    if (
      flags.pollTimeout !== undefined &&
      (!Number.isFinite(flags.pollTimeout) || flags.pollTimeout < 1)
    )
      return "--poll-timeout must be at least 1 second. / --poll-timeout 必须至少为 1 秒。";
    return undefined;
  },
  exampleArgs: [
    "--job-id quant-xxx",
    "--job-id quant-xxx --follow",
    "--job-id quant-xxx --follow --interval 30 --poll-timeout 7200",
  ],
  notes: [
    {
      "en-US": "Without --follow, the command performs one non-blocking status probe.",
      "zh-CN": "不使用 --follow 时仅执行一次非阻塞状态查询。",
    },
    {
      "en-US": "On success, quantized_output can be passed to `deploy text create --model-name`.",
      "zh-CN": "成功后可将 quantized_output 传给 `deploy text create --model-name`。",
    },
  ],
  async run(ctx) {
    const jobId = ctx.flags.jobId;
    const intervalSec = ctx.flags.interval ?? DEFAULT_INTERVAL_SEC;
    if (ctx.settings.dryRun) {
      const resultData1 = {
        action: "finetune.compress.watch",
        job_id: jobId,
        follow: ctx.flags.follow,
        interval: intervalSec,
        timeout: ctx.flags.pollTimeout,
      };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    if (!ctx.flags.follow) {
      const response = await getCompressJob(ctx.client, jobId);
      const status = String(response.output?.status ?? "UNKNOWN").toUpperCase();
      const resultData2 = {
        job_id: jobId,
        status,
        terminal: COMPRESS_TERMINAL_STATUSES.has(status),
        quantized_output: response.output?.quantized_output,
        request_id: response.request_id,
      };
      ctx.output.result(
        resultData2,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData2, null, 2) } : undefined,
      );
      if (COMPRESS_TERMINAL_STATUSES.has(status) && status !== "SUCCEEDED")
        throw formatCompressFailure(jobId, status, response.output?.error?.message);
      return;
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.on("SIGINT", onSigint);
    const startedAt = Date.now();
    try {
      while (true) {
        const response = await getCompressJob(ctx.client, jobId, controller.signal);
        const status = String(response.output?.status ?? "UNKNOWN").toUpperCase();
        if (COMPRESS_TERMINAL_STATUSES.has(status)) {
          ctx.output.result(
            response,
            ctx.settings.output === "text"
              ? { text: JSON.stringify(response, null, 2) }
              : undefined,
          );
          if (status !== "SUCCEEDED")
            throw formatCompressFailure(jobId, status, response.output?.error?.message);
          return;
        }
        if (
          ctx.flags.pollTimeout !== undefined &&
          (Date.now() - startedAt) / 1000 >= ctx.flags.pollTimeout
        ) {
          throw new BailianError(
            `Watching compression job ${jobId} timed out. / 等待压缩任务 ${jobId} 超时。`,
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
