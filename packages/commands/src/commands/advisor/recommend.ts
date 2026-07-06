import {
  analyzeIntent,
  buildDocLink,
  defineCommand,
  detectOutputFormat,
  type GetModelsOptions,
  getModels,
  type IntentProfile,
  type PipelineStep,
  type RecommendedModel,
  type RecommendResult,
  rankModels,
  recallSemantic,
} from "bailian-cli-core";
import boxen from "boxen";
import chalk, { Chalk, type ChalkInstance } from "chalk";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { createSpinner } from "bailian-cli-runtime";

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`;
  return String(tokens);
}

const MODALITY_LABELS: Record<string, string> = {
  Text: "Text",
  Image: "Image",
  Video: "Video",
  Audio: "Audio",
};
const CAPABILITY_LABELS: Record<string, string> = {
  TG: "Text Gen",
  VU: "Vision",
  IG: "Image Gen",
  VG: "Video Gen",
  TTS: "Text-to-Speech",
  ASR: "Speech-to-Text",
  Reasoning: "Reasoning",
};
const BUDGET_LABELS: Record<string, string> = {
  low: "Cost-Effective",
  medium: "Balanced",
  high: "High Investment",
};
const QUALITY_LABELS: Record<string, string> = {
  flagship: "Flagship",
  balanced: "Balanced",
  "cost-optimized": "Value",
};
const PREFERENCE_MODE_LABELS: Record<string, string> = {
  scoped: "Scoped",
  comparison: "Comparison",
  alternative: "Alternative",
};

function formatIntentSummary(intent: IntentProfile, noColor: boolean): string {
  const colorize = noColor ? new Chalk({ level: 0 }) : chalk;

  const lines: string[] = [];
  lines.push(colorize.cyan.bold("Intent Analysis"));

  if (intent.taskSummary) {
    lines.push("");
    lines.push(intent.taskSummary);
  }

  if (intent.scenarioHints.length) {
    lines.push("");
    lines.push(`${colorize.dim("Scenario")}  ${intent.scenarioHints.join(" · ")}`);
  }

  const inputLabels = intent.inputModality.map((mod) => MODALITY_LABELS[mod] ?? mod);
  const outputLabels = intent.outputModality.map((mod) => MODALITY_LABELS[mod] ?? mod);
  if (inputLabels.length || outputLabels.length) {
    lines.push("");
    const parts: string[] = [];
    if (inputLabels.length) parts.push(`${colorize.dim("Input")} ${inputLabels.join(", ")}`);
    if (outputLabels.length) parts.push(`${colorize.dim("Output")} ${outputLabels.join(", ")}`);
    lines.push(parts.join("    "));
  }

  const capLabels = intent.requiredCapabilities.map((cap) => CAPABILITY_LABELS[cap] ?? cap);
  if (capLabels.length) {
    lines.push(`${colorize.dim("Capabilities")}  ${capLabels.join(", ")}`);
  }

  const budgetLabel = BUDGET_LABELS[intent.budget] ?? intent.budget;
  const qualityLabel = QUALITY_LABELS[intent.qualityPreference] ?? intent.qualityPreference;
  lines.push("");
  lines.push(
    `${colorize.dim("Budget")} ${budgetLabel}    ${colorize.dim("Quality")} ${qualityLabel}`,
  );

  const preference = intent.modelPreference;
  if (preference && preference.mode !== "unconstrained") {
    lines.push("");
    const modeLabel = PREFERENCE_MODE_LABELS[preference.mode] ?? preference.mode;
    const prefParts = [colorize.dim("Mode") + ` ${colorize.yellow(modeLabel)}`];
    if (preference.targets?.length) {
      prefParts.push(colorize.dim("Targets") + ` ${preference.targets.join(", ")}`);
    }
    if (preference.excludes?.length) {
      prefParts.push(colorize.dim("Excludes") + ` ${preference.excludes.join(", ")}`);
    }
    lines.push(prefParts.join("    "));
  }

  if (intent.segments?.length) {
    lines.push("");
    lines.push(colorize.dim("Pipeline"));
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

const RECOMMEND_LABELS = ["Best Pick", "Runner-Up", "Alternative"];

function renderCard(rec: RecommendedModel, index: number, colorize: ChalkInstance): string {
  const labelColors = [colorize.green.bold, colorize.blue.bold, colorize.magenta.bold];
  const colorFn = labelColors[index] ?? colorize.white.bold;
  const label = RECOMMEND_LABELS[index] ?? `#${index + 1}`;

  const lines: string[] = [];
  lines.push(colorFn(`⬢  #${index + 1} — ${label}`));
  lines.push("");
  lines.push(`${colorize.bold(rec.name)}  ${colorize.dim(`(${rec.model})`)}`);
  lines.push("");
  lines.push(`${colorize.cyan("Why")}  ${rec.reason}`);

  if (rec.highlights.length) {
    lines.push("");
    lines.push(
      rec.highlights.map((highlight) => colorize.bgGray.white(` ${highlight} `)).join(" "),
    );
  }

  const meta: string[] = [];
  if (rec.contextWindow) meta.push(`Context ${formatContextWindow(rec.contextWindow)}`);
  if (rec.maxOutputTokens) meta.push(`Max Output ${formatContextWindow(rec.maxOutputTokens)}`);
  if (meta.length) {
    lines.push("");
    lines.push(colorize.dim(meta.join("  ·  ")));
  }

  const docLink = buildDocLink(rec.docUrl);
  if (docLink) {
    lines.push("");
    lines.push(colorize.dim(`Docs  ${docLink}`));
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
  lines.push(`  ${colorize.yellow.bold("⚡ Pipeline")}  ${summary}`);

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
  description:
    "Recommend the best models for your use case (intent analysis → candidate recall → LLM ranking)",
  auth: "apiKey",
  usageArgs: "--message <text> [flags]",
  flags: {
    message: {
      type: "string",
      valueHint: "<text>",
      description: "Describe your requirements",
      required: true,
    },
  },
  exampleArgs: [
    '--message "I need a visual-understanding chatbot"',
    '--message "Build an Agent that auto-generates animations"',
    '--message "Legal contract review, high precision required"',
    '--message "Low-cost high-concurrency online customer service" --output json',
    '--message "Long document summarization" --dry-run',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const userInput = flags.message;
    const top = 3;
    const format = detectOutputFormat(settings.output);

    const modelsOptions: GetModelsOptions = {
      onPrepareStart: () => process.stderr.write("Initializing model data...\n"),
    };
    process.stderr.write("Analyzing your request...\n");
    const [allModels, intent] = await Promise.all([
      getModels(settings, modelsOptions),
      analyzeIntent(ctx.client, userInput),
    ]);

    if (intent.confidence === 0) {
      process.stderr.write("Intent analysis timed out, using defaults...\n");
    } else {
      process.stderr.write("\n");
    }

    // Stage 2: Candidate Recall (semantic recall, auto-builds embeddings on first run)
    const candidates = await recallSemantic(ctx.client, allModels, userInput, 50, intent);

    if (settings.dryRun) {
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
    const spinner = createSpinner("Recommending best models...");
    spinner.start();

    const result = await rankModels(ctx.client, candidates, intent, userInput, top);

    spinner.stop();

    if (isEmptyResult(result)) {
      emitBare("No suitable models found for this request.");
      return;
    }

    if (format !== "text") {
      emitResult(
        {
          intent: {
            taskSummary: intent.taskSummary,
            scenarioHints: intent.scenarioHints,
            complexity: intent.complexity,
            inputModality: intent.inputModality,
            outputModality: intent.outputModality,
            requiredCapabilities: intent.requiredCapabilities,
            budget: intent.budget,
            qualityPreference: intent.qualityPreference,
            modelPreference:
              intent.modelPreference?.mode !== "unconstrained" ? intent.modelPreference : undefined,
            segments: intent.segments,
          },
          result,
          candidates: candidates.length,
        },
        format,
      );
      return;
    }

    emitBare(formatIntentSummary(intent, settings.noColor));
    emitBare("");
    emitBare(formatResult(result, settings.noColor));
  },
});
