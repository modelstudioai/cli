import { defineCommand, deleteFineTune, type FlagsDef } from "bailian-cli-core";

const DELETE_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  defaultOutput: "json",
  description: { "en-US": "Delete a fine-tune job record", "zh-CN": "删除微调任务记录" },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the specified fine-tune job record and cannot be undone.",
      "zh-CN": "该操作会永久删除指定的微调任务记录，且无法撤销。",
    },
  },
  usageArgs: "--job-id <id>",
  flags: DELETE_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --dry-run", "--job-id ft-xxx --yes"],
  notes: [
    {
      "en-US": "Irreversible — the job record is permanently removed.",
      "zh-CN": "该操作不可撤销——任务记录将被永久删除。",
    },
    {
      "en-US":
        "Cancel a RUNNING job first via `finetune cancel` — the platform refuses to delete jobs that are still in flight.",
      "zh-CN": "请先通过 `finetune cancel` 取消 RUNNING 任务，平台拒绝删除仍在运行的任务。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;

    if (settings.dryRun) {
      const resultData1 = { action: "finetune.delete", job_id: jobId };
      ctx.output.result(
        resultData1,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData1, null, 2) } : undefined,
      );
      return;
    }

    const response = await deleteFineTune(ctx.client, jobId);

    ctx.output.result(
      response,
      ctx.settings.output === "text" ? { text: JSON.stringify(response, null, 2) } : undefined,
    );
  },
});
