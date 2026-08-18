import { defineCommand, cancelFineTune, type FlagsDef } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const CANCEL_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: { "en-US": "Cancel a running fine-tune job", "zh-CN": "取消正在运行的微调任务" },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: CANCEL_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --dry-run"],
  notes: [
    {
      "en-US":
        "Only PENDING / RUNNING jobs can be cancelled. Completed / failed / already-cancelled jobs return a server-side error (passed through verbatim).",
      "zh-CN":
        "只有 PENDING / RUNNING 状态的任务可以取消。已完成、失败或已取消的任务会返回服务端错误（原样透传）。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;

    if (settings.dryRun) {
      emitResult({ action: "finetune.cancel", job_id: jobId }, "json");
      return;
    }

    const response = await cancelFineTune(ctx.client, jobId);

    if (settings.quiet) {
      emitBare(jobId);
    } else {
      emitResult(response, "json");
    }
  },
});
