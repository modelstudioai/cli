import { defineCommand, getCustomModelImport } from "bailian-cli-core";

import { IMPORT_JOB_ID_FLAGS, PUBLIC_DASHSCOPE_NOTE, buildImportJobOutput } from "./shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Get details of a custom model (import job)",
    "zh-CN": "获取自定义模型（导入任务）的详情",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: IMPORT_JOB_ID_FLAGS,
  exampleArgs: ["--job-id 937b-xxxx", "--job-id 937b-xxxx --output json"],
  notes: [
    PUBLIC_DASHSCOPE_NOTE,
    {
      "en-US":
        "FAILED jobs include the server-provided error_code verbatim; the CLI does not translate it.",
      "zh-CN": "FAILED 任务会原样返回服务端提供的 error_code，CLI 不做翻译。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;

    if (settings.dryRun) {
      const resultData = { action: "cmodel.get", job_id: jobId };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const response = await getCustomModelImport(ctx.client, jobId);
    const job = response.output ?? response.data;
    if (!job) {
      const resultData = { job_id: jobId, error: "No data returned" };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }
    const resultData = { ...buildImportJobOutput(job, jobId), request_id: response.request_id };
    ctx.output.result(
      resultData,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
    );
  },
});
