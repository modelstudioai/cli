import {
  defineCommand,
  detectOutputFormat,
  listCheckpoints,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { formatTable } from "bailian-cli-runtime";

export default defineCommand({
  description: "List checkpoints produced by a fine-tune job",
  usageArgs: "--job-id <id>",
  options: [{ flag: "--job-id <id>", description: "Fine-tune job ID (required)", required: true }],
  exampleArgs: ["--job-id ft-xxx", "--job-id ft-xxx --output json"],
  notes: [
    "Use the returned `checkpoint` value with `bl finetune export` to publish",
    "a deployable model.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const jobId = flags.jobId as string | undefined;
    if (!jobId) failIfMissing("job-id", "bl finetune checkpoints --job-id <id>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "finetune.checkpoints", job_id: jobId }, format);
      return;
    }

    const response = await listCheckpoints(config, jobId!);
    const payload = response.output ?? response.data;
    const ckpts = Array.isArray(payload) ? payload : (payload?.checkpoints ?? []);
    const total = Array.isArray(payload) ? payload.length : (payload?.total ?? ckpts.length);

    const items = ckpts.map((item) => ({
      checkpoint: item.checkpoint ?? item.checkpoint_id ?? "",
      step: item.step !== undefined ? String(item.step) : "",
      status: item.status ?? "",
    }));

    if (format === "json") {
      emitResult({ items, total }, format);
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
  },
});
