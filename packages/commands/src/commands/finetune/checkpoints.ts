import {
  defineCommand,
  detectOutputFormat,
  listCheckpoints,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId, formatTable } from "bailian-cli-runtime";

const CHECKPOINTS_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "List checkpoints produced by a fine-tune job",
    "zh-CN": "列出微调任务生成的 Checkpoint",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: CHECKPOINTS_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --output json"],
  notes: [
    {
      "en-US":
        "Use the returned `checkpoint` value with `finetune export` to publish a deployable model.",
      "zh-CN": "将返回的 `checkpoint` 值传给 `finetune export`，以发布可部署模型。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "finetune.checkpoints", job_id: jobId }, format);
      return;
    }

    const response = await listCheckpoints(ctx.client, jobId);
    const payload = response.output ?? response.data;
    const ckpts = Array.isArray(payload) ? payload : (payload?.checkpoints ?? []);
    const total = Array.isArray(payload) ? payload.length : (payload?.total ?? ckpts.length);

    const items = ckpts.map((item) => ({
      checkpoint: item.checkpoint ?? item.checkpoint_id ?? "",
      step: item.step !== undefined ? String(item.step) : "",
      status: item.status ?? "",
    }));

    if (format === "json") {
      emitResult({ items, total, request_id: response.request_id }, format);
      return;
    }

    // text / quiet
    if (items.length === 0) {
      emitBare("No checkpoints found.");
      return;
    }
    const headers = ["CHECKPOINT", "STEP", "STATUS"];
    const rows = items.map((i) => [i.checkpoint, i.step, i.status]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    emitBare(`\nTotal: ${total}`);
    emitRequestId(response.request_id, settings.quiet);
  },
});
