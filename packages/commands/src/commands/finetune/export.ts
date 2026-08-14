import {
  defineCommand,
  detectOutputFormat,
  exportCheckpoint,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, emitRequestId } from "bailian-cli-runtime";

const EXPORT_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Fine-tune job ID (required)", "zh-CN": "微调任务 ID（必填）" },
    required: true,
  },
  checkpoint: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Checkpoint identifier from `finetune checkpoints` (required)",
      "zh-CN": "来自 `finetune checkpoints` 的 Checkpoint 标识（必填）",
    },
    required: true,
  },
  modelName: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Deployable model name (required)", "zh-CN": "可部署模型名称（必填）" },
    required: true,
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Publish a checkpoint as a deployable model",
    "zh-CN": "将 Checkpoint 发布为可部署模型",
  },
  auth: "apiKey",
  usageArgs: "--job-id <id> --checkpoint <name> --model-name <name>",
  flags: EXPORT_FLAGS,
  exampleArgs: ["--job-id ft-xxx --checkpoint ckpt-3 --model-name my-qwen-sft"],
  notes: [
    {
      "en-US":
        "Required before `deploy <modality> create` can target a checkpoint. The platform may auto-export the best checkpoint when a job reaches SUCCEEDED — explicit export is the canonical path for non-best checkpoints.",
      "zh-CN":
        "必须先执行此操作，`deploy <modality> create` 才能使用 Checkpoint。任务达到 SUCCEEDED 后，平台可能自动导出最佳 Checkpoint；对于非最佳 Checkpoint，显式导出是标准方式。",
    },
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
      emitBare(
        `Next: ${identity.binName} deploy text create --model ${exported} --name <display-name>`,
      );
      emitRequestId(response.request_id, settings.quiet);
    } else {
      emitResult(response, format);
    }
  },
});
