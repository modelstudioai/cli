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
  callConsoleGateway,
  effectiveConsoleGatewayConfig,
  UsageError,
  type Settings,
  type ModelCapability,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const PAGE_SIZE = 50;

/**
 * Page through every foundation-model page (listFoundationModels, public — no
 * console login needed, so the gateway is called anonymously). Returns raw
 * records so capability fields (`supports` / `trainingTypes`) are preserved
 * for filtering.
 */
async function fetchAllFoundationModels(settings: Settings): Promise<ModelCapability[]> {
  const eff = effectiveConsoleGatewayConfig(settings);
  const call = (api: string, data: Record<string, unknown>) =>
    callConsoleGateway(
      { region: eff.consoleRegion, site: eff.consoleSite, switchAgent: eff.consoleSwitchAgent },
      settings.timeout,
      { api, data },
    );
  const first = await fetchModelList(call, { pageNo: 1, pageSize: PAGE_SIZE });
  const all = [...first.models];
  const totalPages = Math.ceil(first.total / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const result = await fetchModelList(call, { pageNo, pageSize: PAGE_SIZE });
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

const CAPABILITY_FLAGS = {
  model: {
    type: "string",
    valueHint: "<m>",
    description: "List training types supported by this base model.",
  },
  trainingType: {
    type: "string",
    valueHint: "<t>",
    description: `List models supporting this training type: ${TRAINING_TYPES_CLI.join(" | ")}.`,
  },
} satisfies FlagsDef;

export default defineCommand({
  description:
    "Query fine-tune training capability — by model (which training types it supports) or by training type (which models support it)",
  auth: "none",
  usageArgs: "--model <m> | --training-type <t>",
  flags: CAPABILITY_FLAGS,
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
  validate: (f) => {
    if (f.model && f.trainingType)
      return "--model and --training-type are mutually exclusive; pass one.";
    if (!f.model && !f.trainingType) return "one of --model / --training-type is required.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const model = flags.model || undefined;
    const trainingType = flags.trainingType || undefined;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
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
      const capability = await fetchModelCapability(settings, model);
      if (!capability) {
        emitBare(`No foundation model found matching "${model}".`);
        return;
      }
      const supported = listSupportedTrainingTypes(capability);
      if (settings.quiet) {
        for (const value of supported) emitBare(value);
        return;
      }
      if (format !== "text") {
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
    if (format !== "text") {
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
