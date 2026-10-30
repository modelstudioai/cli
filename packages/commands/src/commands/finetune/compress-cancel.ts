import { defineCommand, cancelCompressJob } from "bailian-cli-core";

import { COMPRESS_JOB_ID_FLAGS } from "./compress-shared.ts";

export default defineCommand({
  defaultOutput: "json",
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
      const resultData1 = { action: "finetune.compress.cancel", job_id: jobId };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    const response = await cancelCompressJob(ctx.client, jobId);
    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
