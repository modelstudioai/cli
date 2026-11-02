import { defineCommand, deleteCompressJob } from "bailian-cli-core";

import { COMPRESS_JOB_ID_FLAGS } from "./compress-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Delete a compression job record", "zh-CN": "删除压缩任务记录" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the compression job record and cannot be undone.",
      "zh-CN": "该操作会永久删除压缩任务记录，且无法撤销。",
    },
  },
  usageArgs: "--job-id <id>",
  flags: COMPRESS_JOB_ID_FLAGS,
  exampleArgs: ["--job-id quant-xxx", "--job-id quant-xxx --dry-run", "--job-id quant-xxx --yes"],
  notes: [
    {
      "en-US":
        "Only terminal jobs can be deleted. Deleting a job record does not delete its quantized output model.",
      "zh-CN": "只有终态任务可以删除；删除任务记录不会删除其产出的量化模型。",
    },
  ],
  async run(ctx) {
    const jobId = ctx.flags.jobId;
    if (ctx.settings.dryRun) {
      const resultData1 = { action: "finetune.compress.delete", job_id: jobId };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    const response = await deleteCompressJob(ctx.client, jobId);
    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
