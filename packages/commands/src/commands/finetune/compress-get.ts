import { defineCommand, getCompressJob } from "bailian-cli-core";

import { COMPRESS_JOB_ID_FLAGS } from "./compress-shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Get a compression job", "zh-CN": "查询压缩任务详情" },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: COMPRESS_JOB_ID_FLAGS,
  exampleArgs: ["--job-id quant-xxx"],
  async run(ctx) {
    const jobId = ctx.flags.jobId;
    if (ctx.settings.dryRun) {
      const resultData1 = { action: "finetune.compress.get", job_id: jobId };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }
    const resultData2 = await getCompressJob(ctx.client, jobId);
    ctx.output.result(
      resultData2,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData2, null, 2) } : undefined,
    );
  },
});
