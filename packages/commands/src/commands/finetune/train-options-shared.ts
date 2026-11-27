import {
  fetchModelTrainOptions,
  resolveTrainOptions,
  BailianError,
  ExitCode,
  TRAINING_TYPES_CLI,
  UsageError,
  isTrainingTypeCli,
  type CommandContext,
  type FlagDef,
  type FlagsDef,
  type LocalizedText,
  type TrainOptionsIssue,
  type TrainingTypeCli,
} from "bailian-cli-core";

/** User-visible bilingual text for one flag description. */
export interface HelpClause {
  readonly "en-US": string;
  readonly "zh-CN": string;
}

type TrainOptionKey = "modality" | "reasoningMode";

/**
 * Build the training-option context from the dedicated flags. The OpenAPI
 * expects it as one `hyper_parameters` query parameter holding a JSON string
 * (e.g. {"modality":"vision","reasoning_mode":"thinking"}); models without
 * dynamic train options simply omit it.
 */
export function buildTrainOptions(
  modality: string | undefined,
  reasoningMode: string | undefined,
): Record<string, string> {
  const options: Record<string, string> = {};
  if (modality) options.modality = modality;
  if (reasoningMode) options.reasoning_mode = reasoningMode;
  return options;
}

const HYPER_PARAMETERS_QUERY_DESCRIPTIONS: Record<TrainOptionKey, HelpClause> = {
  modality: {
    "en-US":
      "Training modality: text | vision. Only meaningful for models with dynamic train options; sent as modality inside hyper_parameters.",
    "zh-CN":
      "训练模态：text | vision。仅对配置了动态训练选项的模型有意义；作为 hyper_parameters 中的 modality 发送。",
  },
  reasoningMode: {
    "en-US":
      "Reasoning mode: instruct (non-thinking) | thinking. Only meaningful for models with dynamic train options; sent as reasoning_mode inside hyper_parameters.",
    "zh-CN":
      "思考模式：instruct（非思考）| thinking（思考）。仅对配置了动态训练选项的模型有意义；作为 hyper_parameters 中的 reasoning_mode 发送。",
  },
};

/**
 * `--modality` / `--reasoning-mode` flags. The default descriptions fit the
 * GET APIs that carry train options in the `hyper_parameters` query parameter;
 * `finetune text create` passes its own wording because it sends them in the
 * request body and its subcommand also fixes a data format.
 */
export function trainOptionFlags(descriptions: Partial<Record<TrainOptionKey, HelpClause>> = {}) {
  return {
    modality: {
      type: "string",
      valueHint: "<text|vision>",
      description: descriptions.modality ?? HYPER_PARAMETERS_QUERY_DESCRIPTIONS.modality,
      choices: ["text", "vision"] as const,
    },
    reasoningMode: {
      type: "string",
      valueHint: "<instruct|thinking>",
      description: descriptions.reasoningMode ?? HYPER_PARAMETERS_QUERY_DESCRIPTIONS.reasoningMode,
      choices: ["instruct", "thinking"] as const,
    },
  } satisfies FlagsDef;
}

const SERVER_TRAINING_TYPE_MAPPING: HelpClause = {
  "en-US": "Mapped to the server's training_type (e.g. sft-lora -> efficient_sft)",
  "zh-CN": "会映射为服务端 training_type（例如 sft-lora -> efficient_sft）",
};

/**
 * `--training-type` flag. `defaultValue` is the command's own default and is
 * spelled out in the help; `mappingNote` only varies in how the CLI-to-server
 * mapping is phrased.
 */
export function trainingTypeFlag(
  defaultValue: TrainingTypeCli,
  mappingNote: HelpClause = SERVER_TRAINING_TYPE_MAPPING,
) {
  return {
    type: "string",
    valueHint: "<t>",
    description: {
      "en-US": `Training type: ${TRAINING_TYPES_CLI.join(" | ")} (default: ${defaultValue}). ${mappingNote["en-US"]}.`,
      "zh-CN": `训练类型：${TRAINING_TYPES_CLI.join(" | ")}（默认：${defaultValue}）。${mappingNote["zh-CN"]}。`,
    },
  } satisfies FlagDef;
}

/**
 * Resolve `--training-type`: fall back to `fallback` when omitted and reject
 * values outside the CLI whitelist before any request is sent. Returns the CLI
 * value; callers map it to the server code with TRAINING_TYPE_MAP at the
 * interface boundary.
 */
export function resolveTrainingTypeCli(
  value: string | undefined,
  fallback: TrainingTypeCli,
): TrainingTypeCli {
  const trainingType = value || fallback;
  if (!isTrainingTypeCli(trainingType)) {
    throw new BailianError(
      `--training-type "${trainingType}" is not supported.`,
      ExitCode.USAGE,
      `Supported values: ${TRAINING_TYPES_CLI.join(", ")} (default: ${fallback}).`,
    );
  }
  return trainingType;
}

/** Help paragraph shared by the commands that run {@link preflightTrainOptions}. */
export const TRAIN_OPTIONS_PRECHECK_NOTE: LocalizedText = {
  "en-US":
    "--modality / --reasoning-mode travel as one hyper_parameters query parameter (JSON). When a console session is available, the combination is prechecked against the model's supported combinations and omitted options are completed from its defaults; invalid combinations fail with a usage error. Without a console session the check is skipped with a warning and the server result is authoritative.",
  "zh-CN":
    "--modality / --reasoning-mode 会合并为单个 hyper_parameters query 参数（JSON）发送。控制台会话可用时，会按模型支持的组合预检，并从默认值补齐未传的选项；非法组合报用法错误。无控制台会话时跳过预检并输出警告，以服务端结果为准。",
};

export interface TrainOptionsPreflight {
  /** Validated options with omitted values completed from the model defaults. */
  context: Record<string, string>;
  precheck: Record<string, unknown>;
}

function formatIssue(issue: TrainOptionsIssue, model: string): string {
  switch (issue.code) {
    case "not_configured":
      return `Model ${model} has no dynamic train options; remove --modality / --reasoning-mode. / 模型 ${model} 未配置动态训练选项，请移除 --modality / --reasoning-mode。`;
    case "unsupported_value":
      return `Unsupported value "${issue.value}" for train option "${issue.key}". Supported values: ${(issue.expected ?? []).join(", ")}. / 训练选项 "${issue.key}" 的值 "${issue.value}" 不受支持。合法值：${(issue.expected ?? []).join("、")}。`;
    case "invalid_combination": {
      const combinations = (issue.combinations ?? [])
        .map((combination) =>
          Object.entries(combination)
            .map(([key, value]) => `${key}=${value}`)
            .join("+"),
        )
        .join("; ");
      return `Invalid train-options combination for ${model}. Supported combinations: ${combinations}. / 模型 ${model} 的训练选项组合不合法。合法组合：${combinations}。`;
    }
  }
}

/**
 * Best-effort console precheck for dynamic train options (modality /
 * reasoning_mode): validates the user's combination against the console
 * configuration and completes omitted options from the model defaults.
 *
 * Follows the cmodel import contract: usage issues fail fast; a missing or
 * expired console session skips the check with a warning and passes the user
 * options through unchanged — the training API's final result stays
 * authoritative.
 */
export async function preflightTrainOptions(
  ctx: CommandContext,
  model: string,
  serverTrainingType: string,
  userOptions: Record<string, string>,
): Promise<TrainOptionsPreflight> {
  try {
    const options = await fetchModelTrainOptions(
      ctx.client.console.bind(ctx.client),
      model,
      serverTrainingType,
    );
    const { context, issues } = resolveTrainOptions(options, userOptions);
    if (issues.length > 0) {
      throw new UsageError(issues.map((issue) => formatIssue(issue, model)).join("\n"));
    }
    return { context, precheck: { performed: true, dynamic_options: options !== null } };
  } catch (error) {
    if (error instanceof UsageError) throw error;
    ctx.output.warning({
      code: "finetune.train_options_precheck_skipped",
      message: {
        "en-US":
          "Train-options precheck skipped (console session unavailable or expired). The training API's final result is authoritative.",
        "zh-CN": "已跳过训练选项预检（控制台会话不可用或已过期）。以训练接口的最终结果为准。",
      },
      details: { message: error instanceof Error ? error.message : String(error) },
    });
    return { context: userOptions, precheck: { performed: false, reason: "console-unavailable" } };
  }
}
