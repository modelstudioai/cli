import { defineCommand, cancelCompressJob } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { COMPRESS_JOB_ID_FLAGS } from "./compress-shared.ts";

export default defineCommand({
  description: { "en-US": "Cancel a compression job", "zh-CN": "取消压缩任务" },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: COMPRESS_JOB_ID_FLAGS,
  exampleArgs: ["--job-id quant-xxx", "--job-id quant-xxx --dry-run"],
  notes: [
    {
      "en-US": "Only PENDING, QUEUING, or RUNNING jobs can be cancelled.",
      "zh-CN": "只有 PENDING、QUEUING 或 RUNNING 状态的任务可以取消。",
    },
  ],
  async run(ctx) {
    const jobId = ctx.flags.jobId;
    if (ctx.settings.dryRun) {
      emitResult({ action: "finetune.compress.cancel", job_id: jobId }, "json");
      return;
    }
    const response = await cancelCompressJob(ctx.client, jobId);
    if (ctx.settings.quiet) emitBare(jobId);
    else emitResult(response, "json");
  },
});
