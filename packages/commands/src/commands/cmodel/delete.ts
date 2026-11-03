import { defineCommand, deleteCustomModelImport } from "bailian-cli-core";

import { IMPORT_JOB_ID_FLAGS, PUBLIC_DASHSCOPE_NOTE, buildImportJobOutput } from "./shared.ts";

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Delete a custom model and its Bailian-side import record",
    "zh-CN": "删除自定义模型及其百炼侧导入记录",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the Bailian-side import record and imported model copy; it cannot be undone. OSS source files are not modified.",
      "zh-CN": "该操作会永久删除百炼侧导入记录及平台侧导入副本，且无法撤销；不会修改 OSS 源文件。",
    },
  },
  usageArgs: "--job-id <id>",
  flags: IMPORT_JOB_ID_FLAGS,
  exampleArgs: ["--job-id 937b-xxxx", "--job-id 937b-xxxx --dry-run", "--job-id 937b-xxxx --yes"],
  notes: [
    PUBLIC_DASHSCOPE_NOTE,
    {
      "en-US":
        "Irreversible: the import record and imported model are removed from Bailian and must be imported again to restore. OSS source files are untouched.",
      "zh-CN": "不可撤销：导入记录与导入模型会从百炼删除，需重新导入才能恢复；OSS 源文件不受影响。",
    },
    {
      "en-US":
        "Only SUCCESSED or FAILED jobs can be deleted; deleting a RUNNING job is rejected by the service (OperationDenied) and the error is surfaced verbatim.",
      "zh-CN":
        "仅 SUCCESSED 或 FAILED 状态的任务可删除；删除 RUNNING 任务会被服务端拒绝（OperationDenied），错误原样透出。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;

    if (settings.dryRun) {
      const resultData = { action: "cmodel.delete", job_id: jobId };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    const response = await deleteCustomModelImport(ctx.client, jobId);
    const job = response.output ?? response.data;
    const resultData = job
      ? { ...buildImportJobOutput(job, jobId), request_id: response.request_id }
      : { ...response, job_id: jobId };
    ctx.output.result(
      resultData,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
    );
  },
});
