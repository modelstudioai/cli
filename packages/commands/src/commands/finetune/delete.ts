import { defineCommand, deleteFineTune, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const DELETE_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Delete a fine-tune job record", "zh-CN": "删除微调任务记录" },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: DELETE_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --dry-run"],
  notes: [
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
      emitResult({ action: "finetune.delete", job_id: jobId }, "json");
      return;
    }

    const response = await deleteFineTune(ctx.client, jobId);

    if (settings.quiet) {
      emitBare(jobId);
    } else {
      emitResult(response, "json");
    }
  },
});
