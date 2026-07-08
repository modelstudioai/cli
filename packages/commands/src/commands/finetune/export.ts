import {
  defineCommand,
  detectOutputFormat,
  exportCheckpoint,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const EXPORT_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: "Fine-tune job ID (required)",
    required: true,
  },
  checkpoint: {
    type: "string",
    valueHint: "<name>",
    description: "Checkpoint identifier from `finetune checkpoints` (required)",
    required: true,
  },
  modelName: {
    type: "string",
    valueHint: "<name>",
    description: "Deployable model name (required)",
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Publish a checkpoint as a deployable model",
  auth: "apiKey",
  usageArgs: "--job-id <id> --checkpoint <name> --model-name <name>",
  flags: EXPORT_FLAGS,
  exampleArgs: ["--job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft"],
  notes: [
    "Required before `deploy create` can target a checkpoint. The platform",
    "may auto-export the best checkpoint when a job reaches SUCCEEDED — explicit",
    "export is the canonical path for non-best checkpoints.",
  ],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const jobId = flags.jobId;
    const checkpoint = flags.checkpoint;
    const modelName = flags.modelName;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          action: "finetune.export",
          job_id: jobId,
          checkpoint,
          model_name: modelName,
        },
        format,
      );
      return;
    }

    const response = await exportCheckpoint(ctx.client, jobId, checkpoint, modelName);
    const payload = response.output ?? response.data;
    const exported = payload?.model_name ?? modelName;

    if (settings.quiet) {
      emitBare(exported);
    } else if (format === "text") {
      emitBare(`Exported ${jobId} / ${checkpoint} → model_name=${exported}`);
      emitBare(`Next: ${identity.binName} deploy create --model ${exported} --name <display-name>`);
    } else {
      emitResult(response, format);
    }
  },
});
