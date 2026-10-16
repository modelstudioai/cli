import { defineCommand, getCompressJob } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { COMPRESS_JOB_ID_FLAGS } from "./compress-shared.ts";

export default defineCommand({
  description: { "en-US": "Get a compression job", "zh-CN": "查询压缩任务详情" },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: COMPRESS_JOB_ID_FLAGS,
  exampleArgs: ["--job-id quant-xxx"],
  async run(ctx) {
    const jobId = ctx.flags.jobId;
    if (ctx.settings.dryRun) {
      emitResult({ action: "finetune.compress.get", job_id: jobId }, "json");
      return;
    }
    emitResult(await getCompressJob(ctx.client, jobId), "json");
  },
});
