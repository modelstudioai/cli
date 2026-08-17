import { defineCommand, listCheckpoints, type FlagsDef } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const CHECKPOINTS_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
} satisfies FlagsDef;

const EXPIRY_WARN_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours

export default defineCommand({
  description: "List checkpoints produced by a fine-tune job",
  auth: "apiKey",
  usageArgs: "--job-id <id>",
  flags: CHECKPOINTS_FLAGS,
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --output json"],
  notes: [
    "`model_name` (shown for SUCCEEDED checkpoints) is the direct input for `deploy create --model-name`.",
    "Checkpoints expire ~15 days after creation; `expire_time` shows the deadline. Export or deploy before expiry.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const jobId = flags.jobId;

    if (settings.dryRun) {
      emitResult({ action: "finetune.checkpoints", job_id: jobId }, "json");
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
      model_name: item.model_name ?? "",
      expire_time: item.expire_time ?? "",
    }));

    emitResult({ items, total, request_id: response.request_id }, "json");

    // Near-expiry warning: check if any non-expired checkpoint is within 72h of expiry.
    const now = Date.now();
    const expiringSoon = items.filter((item) => {
      if (!item.expire_time) return false;
      const deadline = new Date(item.expire_time).getTime();
      if (Number.isNaN(deadline)) return false;
      const remaining = deadline - now;
      return remaining > 0 && remaining < EXPIRY_WARN_THRESHOLD_MS;
    });
    if (expiringSoon.length > 0) {
      process.stderr.write(
        `\n[warning] ${expiringSoon.length} checkpoint(s) will expire within 72 hours. ` +
          "Export or deploy before expiry to avoid losing the model artifact.\n",
      );
    }
  },
});
