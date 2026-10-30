import {
  defineCommand,
  getBatch,
  BATCH_STATUSES,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult, registerInterruptHandler } from "bailian-cli-runtime";
import { BATCH_ID_FLAGS, DRY_RUN_NOTE, batchInteger, followBatch } from "./shared.ts";
const GET_FLAGS = {
  ...BATCH_ID_FLAGS,
  follow: {
    type: "switch",
    description: {
      "en-US": "Poll until terminal state (Ctrl-C stops only local polling)",
      "zh-CN": "轮询至终态（Ctrl-C 仅停止本地轮询）",
    },
  },
  interval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Query interval, min 60s (default: 65s; --follow only)",
      "zh-CN": "查询间隔，最小 60 秒（默认：65 秒；仅 --follow）",
    },
  },
  pollTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Total polling budget (default: unlimited; --follow only)",
      "zh-CN": "轮询总时限（默认：不限；仅 --follow）",
    },
  },
} satisfies FlagsDef;
export default defineCommand({
  description: {
    "en-US": "Get Batch task details, optionally following progress",
    "zh-CN": "查询 Batch 任务详情，可持续跟踪进度",
  },
  auth: "apiKey",
  flags: GET_FLAGS,
  usageArgs: "--batch-id <id> [--follow] [--interval <seconds>] [--poll-timeout <seconds>]",
  exampleArgs: [
    "--batch-id batch_xxx",
    "--batch-id batch_xxx --follow",
    "--batch-id batch_xxx --follow --interval 65 --poll-timeout 86400",
  ],
  notes: [
    {
      "en-US":
        "Single get exits 0 after a successful query regardless of task state. --follow exits 0 for completed (may contain failed rows), 1 for failed/expired/cancelled, 5 on client timeout, 130 on Ctrl-C. finalizing/cancelling are not terminal. Progress uses stderr; one final result uses stdout. Query errors are retried at most three times only for transport/timeouts or HTTP 429/5xx. Download results promptly; service retention is limited.",
      "zh-CN":
        "单次 get 查询成功即退出 0，不受任务状态影响。--follow：completed 退出 0（可能含失败行），failed/expired/cancelled 退出 1，客户端超时退出 5，Ctrl-C 退出 130。finalizing/cancelling 不是终态。stderr 显示进度，stdout 仅输出最终结果。仅传输/超时或 HTTP 429/5xx 最多重试三次。服务保留期有限，请尽早下载结果。",
    },
    DRY_RUN_NOTE,
  ],
  validate(flags) {
    if (!flags.follow && (flags.interval !== undefined || flags.pollTimeout !== undefined))
      return "--interval/--poll-timeout require --follow. / --interval/--poll-timeout 需要 --follow。";
    batchInteger(flags.interval, "--interval", 60);
    batchInteger(flags.pollTimeout, "--poll-timeout", 1);
    return undefined;
  },
  async run(ctx) {
    if (ctx.settings.dryRun) {
      emitResult({ action: "batch.get", ...ctx.flags }, "json");
      return;
    }
    const controller = new AbortController();
    const interrupt = () =>
      controller.abort(
        new BailianError(
          ctx.localize({
            "en-US": "Local polling interrupted; remote task was not cancelled.",
            "zh-CN": "本地轮询已中断；未取消远端任务。",
          }),
          ExitCode.INTERRUPTED,
        ),
      );
    const releaseInterrupt = ctx.flags.follow ? registerInterruptHandler(interrupt) : undefined;
    const unknown = new Set<string>();
    try {
      const job = ctx.flags.follow
        ? await followBatch(ctx.client, ctx.flags.batchId, {
            interval: ctx.flags.interval ?? 65,
            pollTimeout: ctx.flags.pollTimeout,
            signal: controller.signal,
            progress: (current) => {
              if (!ctx.settings.quiet)
                console.error(
                  `${current.id}: ${current.status} ${JSON.stringify(current.request_counts ?? {})}`,
                );
              if (
                !BATCH_STATUSES.includes(current.status as (typeof BATCH_STATUSES)[number]) &&
                !unknown.has(current.status)
              ) {
                unknown.add(current.status);
                console.error(
                  ctx.localize({
                    "en-US": `Unknown state ${current.status}; keep polling without inferring completion.`,
                    "zh-CN": `未知状态 ${current.status}；继续轮询，不推断已完成。`,
                  }),
                );
              }
            },
          })
        : await getBatch(ctx.client, ctx.flags.batchId);
      if (ctx.settings.quiet) emitBare(job.id);
      else emitResult(job, ctx.settings.output === "text" ? "text" : "json");
      if (ctx.flags.follow) {
        if (job.status !== "completed")
          throw new BailianError(
            job.errors?.data?.find((entry) => entry.message)?.message ??
              ctx.localize({
                "en-US": `Batch ended: ${job.status}.`,
                "zh-CN": `Batch 已结束：${job.status}。`,
              }),
            ExitCode.GENERAL,
            ctx.localize({
              "en-US": "Available partial results may still be downloaded with batch download.",
              "zh-CN": "可通过 batch download 下载仍可用的部分结果。",
            }),
            { rawResponse: JSON.stringify(job) },
          );
        if (!ctx.settings.quiet)
          console.error(
            ctx.localize({
              "en-US": `Completed; failed rows: ${job.request_counts?.failed ?? "unknown"}. Next: batch download --batch-id ${job.id}`,
              "zh-CN": `已完成；失败行：${job.request_counts?.failed ?? "未知"}。下一步：batch download --batch-id ${job.id}`,
            }),
          );
      }
    } finally {
      releaseInterrupt?.();
    }
  },
});
