import {
  defineCommand,
  detectOutputFormat,
  exportCheckpoint,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "finetune export",
  description: "Publish a checkpoint as a deployable model",
  usage: "bl finetune export --job-id <id> --checkpoint <name> --model-name <name>",
  options: [
    { flag: "--job-id <id>", description: "Fine-tune job ID (required)", required: true },
    {
      flag: "--checkpoint <name>",
      description: "Checkpoint identifier from `bl finetune checkpoints`",
      required: true,
    },
    {
      flag: "--model-name <name>",
      description: "Deployable model name (required)",
      required: true,
    },
  ],
  examples: ["bl finetune export --job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft"],
  notes: [
    "Required before `bl deploy create` can target a checkpoint. The platform",
    "may auto-export the best checkpoint when a job reaches SUCCEEDED — explicit",
    "export is the canonical path for non-best checkpoints.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const jobId = flags.jobId as string | undefined;
    if (!jobId) failIfMissing("job-id", "bl finetune export --job-id <id>");
    const checkpoint = flags.checkpoint as string | undefined;
    if (!checkpoint) failIfMissing("checkpoint", "bl finetune export --checkpoint <name>");
    const modelName = flags.modelName as string | undefined;
    if (!modelName) failIfMissing("model-name", "bl finetune export --model-name <name>");

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
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

    const response = await exportCheckpoint(config, jobId!, checkpoint!, modelName!);
    const payload = response.output ?? response.data;
    const exported = payload?.model_name ?? modelName;

    if (config.quiet) {
      emitBare(exported!);
    } else if (format === "text") {
      emitBare(`Exported ${jobId} / ${checkpoint} → model_name=${exported}`);
      emitBare("Next: bl deploy create --model " + exported + " --name <display-name>");
    } else {
      emitResult(response, format);
    }
  },
});
