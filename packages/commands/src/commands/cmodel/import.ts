import {
  defineCommand,
  createCustomModelImport,
  findSupportImportModel,
  listSupportImportModels,
  requiredTrainTypeForWeightType,
  UsageError,
  type CreateCustomModelImportRequest,
  type FlagsDef,
} from "bailian-cli-core";

import { PUBLIC_DASHSCOPE_NOTE } from "./shared.ts";

const CREATE_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Base model ID used for tuning (required, e.g. qwen3-32b)",
      "zh-CN": "训练使用的基础模型 ID（必填，例如 qwen3-32b）",
    },
    required: true,
  },
  weightType: {
    type: "string",
    valueHint: "<type>",
    choices: ["lora", "full"] as const,
    description: {
      "en-US": "Tuning weight type (required): lora or full",
      "zh-CN": "调优类型（必填）：lora 或 full",
    },
    required: true,
  },
  bucket: {
    type: "string",
    valueHint: "<bucket>",
    description: {
      "en-US": "OSS bucket containing the model files (required)",
      "zh-CN": "存放模型文件的 OSS Bucket（必填）",
    },
    required: true,
  },
  objectKey: {
    type: "string",
    valueHint: "<dir/>",
    description: {
      "en-US":
        "OSS directory prefix containing the model files (required, must end with / and not be the bucket root)",
      "zh-CN": "模型文件所在 OSS 目录前缀（必填，必须以 / 结尾且不能是 Bucket 根目录）",
    },
    required: true,
  },
  displayName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Display name (optional, max 50 characters)",
      "zh-CN": "显示名称（可选，最多 50 字符）",
    },
  },
} satisfies FlagsDef;

const OSS_BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export default defineCommand({
  defaultOutput: "json",
  description: {
    "en-US": "Import a custom model from OSS (creates an import job)",
    "zh-CN": "从 OSS 导入自定义模型（创建导入任务）",
  },
  auth: "apiKey",
  optionalConsole: true,
  usageArgs:
    "--base-model <model> --weight-type <lora|full> --bucket <bucket> --object-key <dir/> [--display-name <name>]",
  flags: CREATE_FLAGS,
  exampleArgs: [
    "--base-model qwen3-32b --weight-type lora --bucket my-model-bucket --object-key models/qwen3-32b-lora/",
    "--base-model qwen3-32b --weight-type lora --bucket my-model-bucket --object-key models/qwen3-32b-lora/ --display-name my-lora",
    "--base-model qwen3-32b --weight-type lora --bucket my-model-bucket --object-key models/qwen3-32b-lora/ --dry-run",
  ],
  notes: [
    PUBLIC_DASHSCOPE_NOTE,
    {
      "en-US":
        "After submission, follow the job with `cmodel watch --job-id` and inspect it with `cmodel get` / `cmodel list`.",
      "zh-CN":
        "提交后可用 `cmodel watch --job-id` 跟踪进度，并用 `cmodel get` / `cmodel list` 查看任务。",
    },
    {
      "en-US":
        "The import API is currently available only in the Beijing region; use the console in other regions.",
      "zh-CN": "导入 API 当前仅北京地域开放；其他地域请使用控制台操作。",
    },
    {
      "en-US":
        "The source is fixed to OSS in this release. The bucket must be tagged bailian-datahub-access=read, must not use archive/cold-archive/deep-archive storage or SSE-KMS, and the directory must contain the model files required by the platform (e.g. adapter_model.safetensors, adapter_config.json, config.json).",
      "zh-CN":
        "本期导入来源固定为 OSS。Bucket 需添加 bailian-datahub-access=read 标签，不支持归档/冷归档/深度冷归档存储和 SSE-KMS；目录需包含平台要求的模型文件（如 adapter_model.safetensors、adapter_config.json、config.json）。",
    },
    {
      "en-US":
        "When a valid console session is available, the base model is checked against the console-supported import list before submission: the ID is normalized to the catalog `model` value, and weight-type is checked against the model's supportTrainTypes (lora requires efficient_sft, full requires sft). Unsupported combinations fail immediately with a usage error. If the console session is missing or expired, the check is skipped with a warning and the import API's final result is authoritative.",
      "zh-CN":
        "控制台会话可用时，提交前会用控制台支持导入的基础模型清单校验 --base-model：ID 会规范化为目录返回的 model 值，并按模型的 supportTrainTypes 校验 weight-type（lora 需要 efficient_sft，full 需要 sft），不支持的组合会立即报用法错误。控制台登录缺失或过期时跳过校验并输出警告，以导入接口的最终结果为准。",
    },
    {
      "en-US":
        "The current product version supports importing LoRA models; submitting weight-type=full may be rejected by the service. The API contract keeps both values, so the CLI does not hide `full`.",
      "zh-CN":
        "当前产品版本支持导入 LoRA 模型；提交 weight-type=full 可能被服务端拒绝。API 协议保留两个取值，因此 CLI 不隐藏 full。",
    },
  ],
  validate(flags) {
    if (flags.bucket && !OSS_BUCKET_PATTERN.test(flags.bucket)) {
      return "--bucket must be a valid OSS bucket name (3-63 lowercase letters, digits or hyphens, starting and ending with a letter or digit). / --bucket 必须是合法的 OSS Bucket 名称（3-63 位小写字母、数字或连字符，且以字母或数字开头和结尾）。";
    }
    if (flags.objectKey && (!flags.objectKey.endsWith("/") || flags.objectKey === "/")) {
      return "--object-key must be a non-root directory prefix ending with /. / --object-key 必须是以 / 结尾的非根目录前缀。";
    }
    if (flags.displayName !== undefined && flags.displayName.length > 50) {
      return "--display-name must be at most 50 characters. / --display-name 最多 50 个字符。";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const buildRequest = (baseModel: string): CreateCustomModelImportRequest => ({
      model_name: baseModel,
      ...(flags.displayName ? { display_name: flags.displayName } : {}),
      source: "oss",
      weight_type: flags.weightType,
      storage_info: {
        bucket_name: flags.bucket,
        object_key: flags.objectKey,
      },
    });

    if (settings.dryRun) {
      const resultData = {
        action: "cmodel.import",
        request: buildRequest(flags.baseModel),
        precheck: { performed: false, reason: "dry-run" },
      };
      ctx.output.result(
        resultData,
        ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
      );
      return;
    }

    let baseModel = flags.baseModel;
    let precheck: Record<string, unknown>;
    try {
      const supported = await listSupportImportModels(ctx.client);
      const matched = findSupportImportModel(supported.list, flags.baseModel);
      if (!matched) {
        const supportedModels = supported.list
          .map((entry) => entry.model)
          .filter((model): model is string => Boolean(model))
          .sort();
        throw new UsageError(
          `Base model "${flags.baseModel}" is not in the current import-supported list. Supported models: ${supportedModels.join(
            ", ",
          )}. Run cmodel base-models for the latest list. / 基础模型 "${flags.baseModel}" 不在当前支持导入的模型清单中。支持模型：${supportedModels.join(
            "、",
          )}。可运行 cmodel base-models 查看最新清单。`,
        );
      }
      if (matched.model && matched.model !== flags.baseModel) {
        baseModel = matched.model;
        ctx.output.info({
          "en-US": `Base model normalized to ${matched.model} (catalog model ID).`,
          "zh-CN": `基础模型已规范化为 ${matched.model}（目录返回的模型 ID）。`,
        });
      }
      const supportTrainTypes = matched.supportTrainTypes ?? [];
      const requiredTrainType = requiredTrainTypeForWeightType(flags.weightType);
      if (supportTrainTypes.length > 0 && !supportTrainTypes.includes(requiredTrainType)) {
        const alternativeWeightType = flags.weightType === "lora" ? "full" : "lora";
        throw new UsageError(
          `Base model ${baseModel} supports train types: ${supportTrainTypes.join(
            ", ",
          )}. weight-type=${flags.weightType} requires ${requiredTrainType}; use --weight-type ${alternativeWeightType}. / 基础模型 ${baseModel} 支持的训练方式：${supportTrainTypes.join(
            "、",
          )}。weight-type=${flags.weightType} 需要 ${requiredTrainType}；请改用 --weight-type ${alternativeWeightType}。`,
        );
      }
      precheck = {
        performed: true,
        matched: true,
        ...(baseModel !== flags.baseModel ? { normalized_base_model: baseModel } : {}),
        support_train_types: supportTrainTypes,
      };
    } catch (error) {
      if (error instanceof UsageError) throw error;
      precheck = { performed: false, reason: "console-unavailable" };
      ctx.output.warning({
        code: "model_import.precheck_skipped",
        message: {
          "en-US":
            "Base-model precheck skipped (console session unavailable or expired). The import API's final result is authoritative.",
          "zh-CN": "已跳过基础模型预检（控制台会话不可用或已过期）。以导入接口的最终结果为准。",
        },
        details: { message: error instanceof Error ? error.message : String(error) },
      });
    }

    const response = await createCustomModelImport(ctx.client, buildRequest(baseModel));
    const resultData = { ...response, precheck };
    ctx.output.result(
      resultData,
      ctx.settings.output === "text" ? { text: JSON.stringify(resultData, null, 2) } : undefined,
    );
  },
});
