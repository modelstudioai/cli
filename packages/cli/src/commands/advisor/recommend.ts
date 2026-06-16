import {
  analyzeIntent,
  buildDocLink,
  defineCommand,
  detectOutputFormat,
  type GetModelsOptions,
  getModels,
  type IntentProfile,
  isInteractive,
  type PipelineStep,
  type RecommendedModel,
  type RecommendResult,
  rankModels,
  recallSemantic,
} from "bailian-cli-core";
import boxen from "boxen";
import chalk, { Chalk, type ChalkInstance } from "chalk";
import { emitBare, emitResult } from "../../output/output.ts";
import { createSpinner } from "../../output/progress.ts";
import { failIfMissing, promptText } from "../../output/prompt.ts";

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`;
  return String(tokens);
}

const MODALITY_LABELS: Record<string, string> = {
  Text: "文本",
  Image: "图片",
  Video: "视频",
  Audio: "音频",
};
const CAPABILITY_LABELS: Record<string, string> = {
  TG: "文本生成",
  VU: "视觉理解",
  IG: "图像生成",
  VG: "视频生成",
  TTS: "语音合成",
  ASR: "语音识别",
  Reasoning: "推理",
};
const BUDGET_LABELS: Record<string, string> = {
  low: "低成本优先",
  medium: "适中",
  high: "高投入",
};
const QUALITY_LABELS: Record<string, string> = {
  flagship: "旗舰优先",
  balanced: "均衡",
  "cost-optimized": "性价比优先",
};
const PREFERENCE_MODE_LABELS: Record<string, string> = {
  scoped: "限定范围",
  comparison: "对比评估",
  alternative: "替代推荐",
};

function formatIntentSummary(intent: IntentProfile, noColor: boolean): string {
  const colorize = noColor ? new Chalk({ level: 0 }) : chalk;

  const lines: string[] = [];
  lines.push(colorize.cyan.bold("需求理解"));

  if (intent.taskSummary) {
    lines.push("");
    lines.push(intent.taskSummary);
  }

  if (intent.scenarioHints.length) {
    lines.push("");
    lines.push(`${colorize.dim("场景特征")}  ${intent.scenarioHints.join(" · ")}`);
  }

  const inputLabels = intent.inputModality.map((mod) => MODALITY_LABELS[mod] ?? mod);
  const outputLabels = intent.outputModality.map((mod) => MODALITY_LABELS[mod] ?? mod);
  if (inputLabels.length || outputLabels.length) {
    lines.push("");
    const parts: string[] = [];
    if (inputLabels.length) parts.push(`${colorize.dim("输入")} ${inputLabels.join(", ")}`);
    if (outputLabels.length) parts.push(`${colorize.dim("输出")} ${outputLabels.join(", ")}`);
    lines.push(parts.join("    "));
  }

  const capLabels = intent.requiredCapabilities.map((cap) => CAPABILITY_LABELS[cap] ?? cap);
  if (capLabels.length) {
    lines.push(`${colorize.dim("所需能力")}  ${capLabels.join(", ")}`);
  }

  const budgetLabel = BUDGET_LABELS[intent.budget] ?? intent.budget;
  const qualityLabel = QUALITY_LABELS[intent.qualityPreference] ?? intent.qualityPreference;
  lines.push("");
  lines.push(
    `${colorize.dim("预算倾向")} ${budgetLabel}    ${colorize.dim("质量偏好")} ${qualityLabel}`,
  );

  const preference = intent.modelPreference;
  if (preference && preference.mode !== "unconstrained") {
    lines.push("");
    const modeLabel = PREFERENCE_MODE_LABELS[preference.mode] ?? preference.mode;
    const prefParts = [colorize.dim("推荐模式") + ` ${colorize.yellow(modeLabel)}`];
    if (preference.targets?.length) {
      prefParts.push(colorize.dim("目标") + ` ${preference.targets.join(", ")}`);
    }
    if (preference.excludes?.length) {
      prefParts.push(colorize.dim("排除") + ` ${preference.excludes.join(", ")}`);
    }
    lines.push(prefParts.join("    "));
  }

  if (intent.segments?.length) {
    lines.push("");
    lines.push(colorize.dim("任务拆解"));
    for (const [idx, segment] of intent.segments.entries()) {
      const outMods = segment.outputModality.map((mod) => MODALITY_LABELS[mod] ?? mod).join(", ");
      lines.push(
        `  ${colorize.dim(`${idx + 1}.`)} ${segment.step}${outMods ? colorize.dim(` → ${outMods}`) : ""}`,
      );
    }
  }

  return boxen(lines.join("\n"), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 1, right: 0 },
    borderColor: "cyan",
    borderStyle: "round",
    dimBorder: true,
  });
}

const RECOMMEND_LABELS = ["最佳推荐", "次优选择", "备选参考"];

function renderCard(rec: RecommendedModel, index: number, colorize: ChalkInstance): string {
  const labelColors = [colorize.green.bold, colorize.blue.bold, colorize.magenta.bold];
  const colorFn = labelColors[index] ?? colorize.white.bold;
  const label = RECOMMEND_LABELS[index] ?? `推荐 #${index + 1}`;

  const lines: string[] = [];
  lines.push(colorFn(`⬢ 推荐 #${index + 1} — ${label}`));
  lines.push("");
  lines.push(`${colorize.bold(rec.name)}  ${colorize.dim(`(${rec.model})`)}`);
  lines.push("");
  lines.push(`${colorize.cyan("推荐理由")}  ${rec.reason}`);

  if (rec.highlights.length) {
    lines.push("");
    lines.push(
      rec.highlights.map((highlight) => colorize.bgGray.white(` ${highlight} `)).join(" "),
    );
  }

  const meta: string[] = [];
  if (rec.contextWindow) meta.push(`上下文 ${formatContextWindow(rec.contextWindow)}`);
  if (rec.maxOutputTokens) meta.push(`最大输出 ${formatContextWindow(rec.maxOutputTokens)}`);
  if (meta.length) {
    lines.push("");
    lines.push(colorize.dim(meta.join("  ·  ")));
  }

  const docLink = buildDocLink(rec.docUrl);
  if (docLink) {
    lines.push("");
    lines.push(colorize.dim(`文档  ${docLink}`));
  }

  return boxen(lines.join("\n"), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 1, right: 0 },
    borderColor: "gray",
    borderStyle: "round",
    dimBorder: true,
  });
}

function formatSingleResult(results: RecommendedModel[], noColor: boolean): string {
  const colorize = noColor ? new Chalk({ level: 0 }) : chalk;
  return results.map((rec, idx) => renderCard(rec, idx, colorize)).join("\n");
}

function formatPipelineResult(summary: string, steps: PipelineStep[], noColor: boolean): string {
  const colorize = noColor ? new Chalk({ level: 0 }) : chalk;
  const lines: string[] = [];
  lines.push(`  ${colorize.yellow.bold("⚡ 组合方案")}  ${summary}`);

  for (const [stepIdx, { step, recommendations, warnings }] of steps.entries()) {
    lines.push("");
    lines.push(colorize.bold(`  ━━━ Step ${stepIdx + 1}: ${step} ━━━`));

    if (warnings?.length) {
      for (const warning of warnings) {
        lines.push(`  ${colorize.yellow("⚠")} ${colorize.yellow(warning)}`);
      }
    }

    lines.push("");
    lines.push(recommendations.map((rec, idx) => renderCard(rec, idx, colorize)).join("\n"));
  }

  return lines.join("\n");
}

function formatResult(result: RecommendResult, noColor: boolean): string {
  if (result.type === "pipeline") {
    return formatPipelineResult(result.summary, result.steps, noColor);
  }
  return formatSingleResult(result.recommendations, noColor);
}

function isEmptyResult(result: RecommendResult): boolean {
  if (result.type === "pipeline") return result.steps.length === 0;
  return result.recommendations.length === 0;
}

export default defineCommand({
  name: "advisor recommend",
  description:
    "Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking)",
  usage: "bl advisor recommend <prompt> [flags]",
  options: [
    {
      flag: "--message <text>",
      description: "Describe your requirements (alternative to positional prompt)",
    },
    {
      flag: "--dry-run",
      description: "Show intent analysis and candidate list without LLM ranking",
    },
    {
      flag: "--output <format>",
      description: "Output format: text (default in TTY), json, yaml",
    },
  ],
  examples: [
    'bl advisor recommend --message "I need a visual-understanding chatbot"',
    'bl advisor recommend --message "Build an Agent that auto-generates animations"',
    'bl advisor recommend --message "Legal contract review, high precision required"',
    'bl advisor recommend --message "Low-cost high-concurrency online customer service" --output json',
    'bl advisor recommend --message "Long document summarization" --dry-run',
    "bl advisor recommend                                          # Interactive input",
  ],
  async run(config, flags) {
    const positional = ((flags as Record<string, unknown>)._positional as string[]) ?? [];
    let userInput = flags.message || positional.join(" ");

    if (!userInput.trim()) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "描述你的需求:" });
        if (!hint) {
          process.stderr.write("已取消。\n");
          process.exit(1);
        }
        userInput = hint;
      } else {
        failIfMissing("message", 'bl advisor recommend "你的需求"');
      }
    }

    const top = 3;
    const format = detectOutputFormat(config.output);

    const modelsOptions: GetModelsOptions = {
      onPrepareStart: () => process.stderr.write("初始化中...\n"),
    };
    process.stderr.write("正在分析需求...\n");
    const [allModels, intent] = await Promise.all([
      getModels(config, modelsOptions),
      analyzeIntent(config, userInput),
    ]);

    if (intent.confidence === 0) {
      process.stderr.write("需求分析超时，使用默认参数继续...\n");
    } else {
      process.stderr.write("\n");
    }

    // Stage 2: Candidate Recall (semantic recall, auto-builds embeddings on first run)
    const candidates = await recallSemantic(config, allModels, userInput, 50, intent);

    if (config.dryRun) {
      emitResult(
        {
          userInput,
          intent,
          candidateCount: candidates.length,
          candidates: candidates.map(({ model, score }) => ({
            model: model.model,
            score,
          })),
          top,
        },
        format,
      );
      return;
    }

    // Stage 3: LLM Ranking
    const spinner = createSpinner("正在推荐最佳模型...");
    spinner.start();

    const result = await rankModels(config, candidates, intent, userInput, top);

    spinner.stop();

    if (isEmptyResult(result)) {
      emitBare("暂无满足该需求的模型。");
      return;
    }

    if (format !== "text") {
      emitResult(result, format);
      return;
    }

    emitBare(formatIntentSummary(intent, config.noColor));
    emitBare("");
    emitBare(formatResult(result, config.noColor));
  },
});
