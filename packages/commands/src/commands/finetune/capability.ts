import {
  defineCommand,
  detectOutputFormat,
  fetchModelList,
  fetchModelCapability,
  listSupportedTrainingTypes,
  modelSupportsTrainingType,
  isTrainingTypeCli,
  trainingTypeMethodVariant,
  TRAINING_TYPES_CLI,
  type Config,
  type GlobalFlags,
  type ModelCapability,
} from "bailian-cli-core";
import { failIfMissing } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

const PAGE_SIZE = 50;

/**
 * Page through every foundation-model page (listFoundationModels, public — no
 * console login needed). Returns raw records so capability fields
 * (`supports` / `trainingTypes`) are preserved for filtering.
 */
async function fetchAllFoundationModels(config: Config): Promise<ModelCapability[]> {
  const first = await fetchModelList(config, "", { pageNo: 1, pageSize: PAGE_SIZE });
  const all = [...first.models];
  const totalPages = Math.ceil(first.total / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const result = await fetchModelList(config, "", { pageNo, pageSize: PAGE_SIZE });
    all.push(...result.models);
  }
  return all as ModelCapability[];
}

const VARIANT_LABEL: Record<string, string> = {
  full: "full-parameter",
  lora: "LoRA",
};

function describeTrainingType(value: string): string {
  if (!isTrainingTypeCli(value)) return value;
  const { method, variant } = trainingTypeMethodVariant(value);
  return `${VARIANT_LABEL[variant] ?? variant} ${method.toUpperCase()}`;
}

export default defineCommand({
  description:
    "Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it)",
  usageArgs: "--model <m> | --training-type <t>",
  options: [
    {
      flag: "--model <m>",
      description: "List training types supported by this base model.",
    },
    {
      flag: "--training-type <t>",
      description: `List models supporting this training type: ${TRAINING_TYPES_CLI.join(" | ")}.`,
    },
  ],
  exampleArgs: [
    "--model qwen3-8b",
    "--training-type sft-lora",
    "--training-type cpt --output json",
    "--training-type sft --quiet",
  ],
  notes: [
    "Exactly one of --model / --training-type is required.",
    "Training-type values use the `<method>` / `<method>-lora` convention:",
    "sft | sft-lora | dpo | dpo-lora | cpt. (cpt has no -lora variant server-side.)",
    "Queries listFoundationModels, a public API — no console login needed.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const model = (flags.model as string | undefined) || undefined;
    const trainingType = (flags.trainingType as string | undefined) || undefined;

    if (model && trainingType) {
      throw new Error("--model and --training-type are mutually exclusive; pass one.");
    }
    if (!model && !trainingType) {
      failIfMissing("model or training-type", "--model <m> | --training-type <t>");
    }

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult(
        {
          action: "finetune.capability",
          model,
          training_type: trainingType,
        },
        format,
      );
      return;
    }

    // Direction 1: by model → which training types it supports.
    if (model) {
      const capability = await fetchModelCapability(config, model);
      if (!capability) {
        emitBare(`No foundation model found matching "${model}".`);
        return;
      }
      const supported = listSupportedTrainingTypes(capability);
      if (config.quiet) {
        for (const value of supported) emitBare(value);
        return;
      }
      if (format !== "rich") {
        emitResult(
          {
            model: capability.model ?? model,
            supported,
            supports: capability.supports,
            trainingTypes: capability.trainingTypes,
          },
          format,
        );
        return;
      }
      emitBare(`${capability.model ?? model}`);
      emitBare(supported.length ? "Supported training types:" : "No supported training types.");
      for (const value of supported) {
        emitBare(`  ${value.padEnd(10)} ${describeTrainingType(value)}`);
      }
      return;
    }

    // Direction 2: by training type → which models support it.
    if (!isTrainingTypeCli(trainingType!)) {
      throw new Error(
        `--training-type "${trainingType}" is not supported. Valid: ${TRAINING_TYPES_CLI.join(", ")}.`,
      );
    }
    const { method, variant } = trainingTypeMethodVariant(
      trainingType as Parameters<typeof trainingTypeMethodVariant>[0],
    );
    const all = await fetchAllFoundationModels(config);
    const matched = all
      .filter((record) =>
        modelSupportsTrainingType(
          record,
          trainingType as Parameters<typeof modelSupportsTrainingType>[1],
        ),
      )
      .map((record) => ({
        model: record.model as string,
        name: (record.name as string | undefined) ?? (record.model as string),
      }))
      .filter((entry) => Boolean(entry.model))
      .sort((left, right) => left.model.localeCompare(right.model));

    if (config.quiet) {
      for (const entry of matched) emitBare(entry.model);
      return;
    }
    if (format !== "rich") {
      emitResult(
        {
          training_type: trainingType,
          method,
          variant,
          count: matched.length,
          models: matched,
        },
        format,
      );
      return;
    }
    emitBare(`Models supporting ${trainingType} (${method} / ${variant}): ${matched.length}`);
    for (const entry of matched) emitBare(`  ${entry.model}`);
  },
});
