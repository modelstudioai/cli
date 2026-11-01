import {
  defineCommand,
  batchDataNotes,
  batchUsage,
  validateBatch,
  readBatchBlob,
  uploadDataset,
  createBatch,
  type FlagsDef,
  type BatchReport,
  type BatchCreateParams,
} from "bailian-cli-core";
import {
  ENDPOINT_FLAGS,
  DRY_RUN_NOTE,
  completionWindow,
  batchMetadata,
  validateBatchSource,
} from "./shared.ts";
const CREATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<jsonl>",
    description: {
      "en-US": "Local Batch JSONL (exclusive with --input-file-id)",
      "zh-CN": "本地 Batch JSONL（与 --input-file-id 二选一）",
    },
  },
  inputFileId: {
    type: "string",
    valueHint: "<source>",
    description: {
      "en-US": "File ID, OSS HTTPS URL or oss:region:bucket/path",
      "zh-CN": "文件 ID、OSS HTTPS URL 或 oss:region:bucket/path",
    },
  },
  completionWindow: {
    type: "string",
    valueHint: "<24h|7d>",
    description: {
      "en-US": "Completion window: 24–336 hours (default: 24h)",
      "zh-CN": "完成时限：24–336 小时（默认：24h）",
    },
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Task name (max 100 characters)",
      "zh-CN": "任务名称（最多 100 字符）",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Task description (max 200 characters)",
      "zh-CN": "任务描述（最多 200 字符）",
    },
  },
  callbackUrl: {
    type: "string",
    valueHint: "<url>",
    description: {
      "en-US": "Completion callback (documented in Beijing only)",
      "zh-CN": "完成回调（文档仅支持北京）",
    },
  },
  metadata: {
    type: "array",
    valueHint: "<KEY=VALUE>",
    description: {
      "en-US": "Custom task metadata (repeatable)",
      "zh-CN": "任务级自定义元数据（可重复）",
    },
  },
  ...ENDPOINT_FLAGS,
} satisfies FlagsDef;
export default defineCommand({
  description: {
    "en-US": "Upload or reference input and create an asynchronous Batch task",
    "zh-CN": "上传或引用输入文件，创建异步 Batch 任务",
  },
  auth: "apiKey",
  flags: CREATE_FLAGS,
  usageArgs: "(--file <jsonl> | --input-file-id <source> --endpoint <path>) [flags]",
  exampleArgs: [
    "--file input.jsonl --name eval-1 --dry-run",
    "--file input.jsonl --completion-window 24h",
    "--input-file-id file-batch-xxx --endpoint /v1/chat/completions",
    "--input-file-id oss:cn-beijing:my-bucket/input.jsonl --endpoint /v1/chat/completions --completion-window 7d",
  ],
  notes: [
    batchDataNotes("create"),
    {
      "en-US":
        "Local input: <=50,000 requests, <=500 MiB, <=6 MiB per line; >1 MiB warns due to conflicting documentation. batch-test-model: <=100 requests and <=1 MiB. Remote references require authorization and sufficient URL validity; they are not downloaded for validation. No automatic POST replay or uploaded-file cleanup on failure.",
      "zh-CN":
        "本地输入：最多 50,000 条、500 MiB，单行最多 6 MiB；因文档冲突，超过 1 MiB 告警。batch-test-model 专限 100 条/1 MiB。远端引用需授权与足够有效期，不下载校验。POST 不自动重放，创建失败不自动删除已上传文件。",
    },
    DRY_RUN_NOTE,
  ],
  validate(flags) {
    if (Boolean(flags.file) === Boolean(flags.inputFileId))
      return "Provide exactly one of --file and --input-file-id. / --file 与 --input-file-id 必须且只能提供一个。";
    if (flags.inputFileId && !flags.endpoint)
      return "Remote input requires --endpoint. / 远端输入必须指定 --endpoint。";
    completionWindow(flags.completionWindow);
    batchMetadata(flags);
    if (flags.inputFileId) validateBatchSource(flags.inputFileId);
    return undefined;
  },
  async run(ctx) {
    const { flags, settings } = ctx;
    let blob: Blob | undefined;
    let report: BatchReport | undefined;
    if (flags.file) {
      if (!settings.dryRun) blob = await readBatchBlob(flags.file);
      report = await validateBatch(blob ?? flags.file);
      if (flags.endpoint && flags.endpoint !== report.endpoint)
        batchUsage("--endpoint differs from JSONL url.", "--endpoint 与 JSONL url 不一致。");
      for (const warning of report.warnings)
        ctx.output.warning({ code: "BATCH_VALIDATION_WARNING", message: warning });
    }
    const request: BatchCreateParams = {
      input_file_id: flags.inputFileId ?? "<uploaded-file-id>",
      endpoint: flags.endpoint ?? report!.endpoint,
      completion_window: completionWindow(flags.completionWindow),
      metadata: batchMetadata(flags),
    };
    if (settings.dryRun) {
      const preview = {
        action: "batch.create",
        request,
        validation: report,
        upload: flags.file ? { file: flags.file, purpose: "batch" } : undefined,
      };
      ctx.output.result(preview, { text: JSON.stringify(preview, null, 2) });
      return;
    }
    let uploaded: string | undefined;
    if (flags.file) {
      const file = await uploadDataset(ctx.client, {
        filePath: flags.file,
        fileBlob: blob,
        purpose: "batch",
      });
      uploaded = file.file_id;
      request.input_file_id = uploaded;
    }
    try {
      const job = await createBatch(ctx.client, request);
      ctx.output.result(job);
    } catch (error) {
      if (uploaded)
        ctx.output.warning({
          code: "BATCH_INPUT_UPLOADED",
          message: {
            "en-US": `Input uploaded: ${uploaded}. Creation failed; reuse --input-file-id with --endpoint or inspect dataset file management. The file was not deleted.`,
            "zh-CN": `输入已上传：${uploaded}。创建失败；可通过 --input-file-id 与 --endpoint 复用，或检查 dataset 文件管理。未删除该文件。`,
          },
          details: { file_id: uploaded },
        });
      throw error;
    }
  },
});
