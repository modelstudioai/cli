import { defineCommand, cancelBatch } from "bailian-cli-core";
import { BATCH_ID_FLAGS, DRY_RUN_NOTE } from "./shared.ts";
export default defineCommand({
  description: { "en-US": "Request cancellation of a Batch task", "zh-CN": "请求取消 Batch 任务" },
  auth: "apiKey",
  flags: BATCH_ID_FLAGS,
  usageArgs: "--batch-id <id>",
  exampleArgs: ["--batch-id batch_xxx", "--batch-id batch_xxx --dry-run"],
  notes: [
    {
      "en-US":
        "An accepted cancellation may return cancelling, not cancelled. Use batch get --follow to confirm. Already executed requests still incur charges; files are not deleted.",
      "zh-CN":
        "取消受理可能返回 cancelling，不代表已 cancelled。用 batch get --follow 确认。已执行请求仍计费，不删除文件。",
    },
    DRY_RUN_NOTE,
  ],
  async run(ctx) {
    if (ctx.settings.dryRun) {
      const preview = { action: "batch.cancel", batch_id: ctx.flags.batchId };
      ctx.output.result(preview, { text: JSON.stringify(preview, null, 2) });
      return;
    }
    const job = await cancelBatch(ctx.client, ctx.flags.batchId);
    ctx.output.result(job);
  },
});
