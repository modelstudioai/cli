import { defineCommand, getCompressJobLogs, type FlagsDef } from "bailian-cli-core";

import { COMPRESS_JOB_ID_FLAGS } from "./compress-shared.ts";

const LOG_FLAGS = {
  ...COMPRESS_JOB_ID_FLAGS,
  offset: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Skip the first N lines (default: 0)",
      "zh-CN": "跳过前 N 行（默认：0）",
    },
  },
  lines: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Number of lines to read (default: 100, max: 1000)",
      "zh-CN": "读取行数（默认：100，最多：1000）",
    },
  },
  tail: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Read the last N log lines", "zh-CN": "读取最后 N 行日志" },
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Get compression job logs", "zh-CN": "获取压缩任务日志" },
  auth: "apiKey",
  usageArgs: "--job-id <id> [--offset <n>] [--lines <n> | --tail <n>]",
  flags: LOG_FLAGS,
  validate(flags) {
    if (flags.offset !== undefined && (!Number.isInteger(flags.offset) || flags.offset < 0))
      return "--offset must be a non-negative integer. / --offset 必须是非负整数。";
    if (
      flags.lines !== undefined &&
      (!Number.isInteger(flags.lines) || flags.lines < 1 || flags.lines > 1000)
    )
      return "--lines must be an integer between 1 and 1000. / --lines 必须是 1–1000 的整数。";
    if (
      flags.tail !== undefined &&
      (!Number.isInteger(flags.tail) || flags.tail < 1 || flags.tail > 1000)
    )
      return "--tail must be an integer between 1 and 1000. / --tail 必须是 1–1000 的整数。";
    if (flags.tail !== undefined && (flags.offset !== undefined || flags.lines !== undefined))
      return "--tail cannot be combined with --offset or --lines. / --tail 不能与 --offset 或 --lines 同时使用。";
    return undefined;
  },
  exampleArgs: [
    "--job-id quant-xxx",
    "--job-id quant-xxx --offset 0 --lines 50",
    "--job-id quant-xxx --tail 20",
  ],
  async run(ctx) {
    const jobId = ctx.flags.jobId;
    if (ctx.settings.dryRun) {
      const resultData1 = {
        action: "finetune.compress.logs",
        job_id: jobId,
        offset: ctx.flags.offset,
        line: ctx.flags.lines,
        tail: ctx.flags.tail,
      };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    if (ctx.flags.tail !== undefined) {
      const first = await getCompressJobLogs(ctx.client, jobId, { offset: 0, line: 1 });
      const total = first.output?.total ?? 0;
      const offset = Math.max(0, total - ctx.flags.tail);
      const resultData2 = await getCompressJobLogs(ctx.client, jobId, {
        offset,
        line: ctx.flags.tail,
      });
      ctx.output.result(
        resultData2,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData2, null, 2) } : undefined,
      );
      return;
    }
    const resultData3 = await getCompressJobLogs(ctx.client, jobId, {
      offset: ctx.flags.offset,
      line: ctx.flags.lines,
    });
    ctx.output.result(
      resultData3,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData3, null, 2) } : undefined,
    );
  },
});
