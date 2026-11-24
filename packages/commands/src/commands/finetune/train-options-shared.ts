import {
  fetchModelTrainOptions,
  resolveTrainOptions,
  UsageError,
  type CommandContext,
  type TrainOptionsIssue,
} from "bailian-cli-core";

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
