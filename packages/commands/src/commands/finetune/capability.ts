import {
  defineCommand,
  fetchModelListAll,
  fetchModelCapability,
  listSupportedTrainingTypes,
  modelSupportsTrainingType,
  isTrainingTypeCli,
  trainingTypeMethodVariant,
  TRAINING_TYPES_CLI,
  anonymousConsoleCall,
  UsageError,
  type Settings,
  type ModelCapability,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

/**
 * Page through every foundation-model page (listFoundationModels, public — no
 * console login needed, so the gateway is called anonymously). Returns raw
 * records so capability fields (`supports` / `trainingTypes`) are preserved
 * for filtering.
 */
async function fetchAllFoundationModels(settings: Settings): Promise<ModelCapability[]> {
  const all = await fetchModelListAll(anonymousConsoleCall(settings));
  return all as ModelCapability[];
}

const CAPABILITY_FLAGS = {
  baseModel: {
    type: "string",
    valueHint: "<m>",
    description: {
      "en-US": "List training types supported by this base model.",
      "zh-CN": "列出该基础模型支持的训练类型。",
    },
  },
  trainingType: {
    type: "string",
    valueHint: "<t>",
    description: {
      "en-US": `List models supporting this training type: ${TRAINING_TYPES_CLI.join(" | ")}.`,
      "zh-CN": `列出支持该训练类型的模型：${TRAINING_TYPES_CLI.join(" | ")}。`,
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US":
      "Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it)",
    "zh-CN": "查询微调训练能力：按模型查询其支持的训练类型，或按训练类型查询支持它的模型",
  },
  auth: "none",
  usageArgs: "--base-model <m> | --training-type <t>",
  flags: CAPABILITY_FLAGS,
  exampleArgs: [
    "--base-model qwen3-8b",
    "--training-type sft-lora",
    "--training-type cpt --output json",
    "--training-type sft --quiet",
  ],
  notes: [
    {
      "en-US": "Exactly one of --base-model / --training-type is required.",
      "zh-CN": "--base-model 和 --training-type 必须且只能指定一个。",
    },
    {
      "en-US":
        "Training-type values use the `<method>` / `<method>-lora` convention: sft | sft-lora | dpo | dpo-lora | cpt. (cpt has no -lora variant server-side.)",
      "zh-CN":
        "训练类型遵循 `<method>` / `<method>-lora` 命名约定：sft | sft-lora | dpo | dpo-lora | cpt。（服务端没有 cpt-lora 变体。）",
    },
    {
      "en-US": "Queries listFoundationModels, a public API — no console login needed.",
      "zh-CN": "查询公开 API listFoundationModels，无需登录控制台。",
    },
  ],
  validate: (f) => {
    if (f.baseModel && f.trainingType)
      return "--base-model and --training-type are mutually exclusive; pass one.";
    if (!f.baseModel && !f.trainingType)
      return "one of --base-model / --training-type is required.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const model = flags.baseModel || undefined;
    const trainingType = flags.trainingType || undefined;

    if (settings.dryRun) {
      emitResult(
        {
          action: "finetune.capability",
          model,
          training_type: trainingType,
        },
        "json",
      );
      return;
    }

    // Direction 1: by model → which training types it supports.
    if (model) {
      const capability = await fetchModelCapability(settings, model);
      if (!capability) {
        emitResult({ model, error: `No foundation model found matching "${model}".` }, "json");
        return;
      }
      const supported = listSupportedTrainingTypes(capability);
      if (settings.quiet) {
        for (const value of supported) emitBare(value);
        return;
      }
      emitResult(
        {
          model: capability.model ?? model,
          supported,
          supports: capability.supports,
          trainingTypes: capability.trainingTypes,
        },
        "json",
      );
      return;
    }

    // Direction 2: by training type → which models support it.
    if (!trainingType || !isTrainingTypeCli(trainingType)) {
      throw new UsageError(
        `--training-type "${trainingType}" is not supported. Valid: ${TRAINING_TYPES_CLI.join(", ")}.`,
      );
    }
    const { method, variant } = trainingTypeMethodVariant(trainingType);
    const all = await fetchAllFoundationModels(settings);
    const matched = all
      .filter((record) => modelSupportsTrainingType(record, trainingType))
      .map((record) => ({
        model: record.model as string,
        name: (record.name as string | undefined) ?? (record.model as string),
      }))
      .filter((entry) => Boolean(entry.model))
      .sort((left, right) => left.model.localeCompare(right.model));

    if (settings.quiet) {
      for (const entry of matched) emitBare(entry.model);
      return;
    }
    emitResult(
      {
        training_type: trainingType,
        method,
        variant,
        count: matched.length,
        models: matched,
      },
      "json",
    );
  },
});
