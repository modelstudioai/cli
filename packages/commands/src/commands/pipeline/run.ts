import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  BailianError,
  UsageError,
  defineCommand,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { initPipelineSteps } from "bailian-cli-runtime";
import { executePipeline, streamPipelineEvents } from "bailian-cli-runtime";
import type { PipelineLifecycleEvent } from "bailian-cli-runtime";
import { loadPipelineFile } from "./load-file.ts";

const RUN_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Pipeline definition file (YAML/JSON)",
      "zh-CN": "Pipeline 定义文件（YAML/JSON）",
    },
    required: true,
  },
  input: {
    type: "string",
    valueHint: "<json>",
    description: { "en-US": "Runtime input as inline JSON", "zh-CN": "内联 JSON 格式的运行时输入" },
  },
  inputFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Runtime input from a JSON file",
      "zh-CN": "来自 JSON 文件的运行时输入",
    },
  },
  concurrency: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Max parallel steps (default: 1)",
      "zh-CN": "最大并行步骤数（默认：1）",
    },
  },
  events: {
    type: "string",
    valueHint: "<format>",
    description: {
      "en-US": "Emit raw lifecycle events: jsonl (requires text output)",
      "zh-CN": "输出原始生命周期事件：jsonl（需 text 输出模式）",
    },
    choices: ["jsonl"] as const,
  },
  stepTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Default step timeout in seconds",
      "zh-CN": "默认步骤超时时间，单位为秒",
    },
  },
} satisfies FlagsDef;
type RunFlags = ParsedFlags<typeof RUN_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Run a pipeline workflow definition",
    "zh-CN": "运行 Pipeline 工作流定义",
  },
  auth: "none",
  usageArgs: "--file <path> [flags]",
  flags: RUN_FLAGS,
  exampleArgs: [
    {
      "en-US": '--file workflow.yaml --input \'{"brief":"hello"}\'',
      "zh-CN": '--file workflow.yaml --input \'{"brief":"你好"}\'',
    },
    "--file workflow.json --input-file inputs.json --concurrency 3",
    "--file workflow.yaml --dry-run",
    "--file workflow.json --output text --events jsonl",
    "--file workflow.yaml --output json",
  ],
  validate: (f) => (f.input && f.inputFile ? "use --input or --input-file, not both" : undefined),
  async run(ctx) {
    const { settings, flags } = ctx;
    const file = flags.file;

    const eventsFormat = flags.events;
    if (eventsFormat === "jsonl" && settings.output === "json") {
      throw new UsageError(
        ctx.localize({
          "en-US": "Lifecycle events cannot be combined with JSON result output.",
          "zh-CN": "生命周期事件不能与 JSON 结果输出组合使用。",
        }),
        ctx.localize({
          "en-US":
            "Use --output text --events jsonl for the lifecycle stream, or --output json without --events for the final report.",
          "zh-CN":
            "使用 --output text --events jsonl 获取生命周期事件流，或使用 --output json 且不指定 --events 获取最终报告。",
        }),
      );
    }
    initPipelineSteps();

    const filePath = resolve(file);
    const pipeline = await loadPipelineFile(filePath);
    const runtimeInput = await resolveRuntimeInput(flags);
    const basePath = dirname(filePath);

    if (eventsFormat === "jsonl") {
      for await (const event of streamPipelineEvents(pipeline, runtimeInput, {
        output: ctx.output,
        concurrency: flags.concurrency,
        basePath,
        dryRun: settings.dryRun,
        timeoutSeconds: flags.stepTimeout,
      })) {
        process.stdout.write(JSON.stringify(event) + "\n");
      }
      return;
    }

    const report = await executePipeline(pipeline, runtimeInput, {
      output: ctx.output,
      concurrency: flags.concurrency,
      basePath,
      dryRun: settings.dryRun,
      timeoutSeconds: flags.stepTimeout,
      onEvent: (event) =>
        ctx.output.debug({
          code: "PIPELINE_EVENT",
          message: formatEvent(event),
          details: event,
        }),
    });

    ctx.output.result(report, { text: formatTextReport(report) });
    if (report.status === "failed") {
      throw new BailianError(
        ctx.localize({
          "en-US": "Pipeline failed.",
          "zh-CN": "Pipeline 执行失败。",
        }),
      );
    }
  },
});

async function resolveRuntimeInput(flags: RunFlags): Promise<Record<string, unknown>> {
  const inputJson = flags.input;
  const inputFile = flags.inputFile;
  if (inputJson) return JSON.parse(inputJson) as Record<string, unknown>;
  if (inputFile) {
    const raw = await readFile(resolve(inputFile), "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  }
  return {};
}

function formatEvent(event: PipelineLifecycleEvent): string {
  const prefix = `[${event.type}]`;
  if ("stepCount" in event) {
    return `${prefix} ${event.stepCount} step${event.stepCount === 1 ? "" : "s"}`;
  }
  return "step" in event && event.step ? `${prefix} ${formatStep(event.step)}` : prefix;
}

function formatStep(step: { id: string; type: string; index?: number; total?: number }): string {
  const progress =
    step.index !== undefined && step.total !== undefined ? `${step.index}/${step.total} ` : "";
  return `${progress}${step.id} (${step.type})`;
}

function formatTextReport(report: {
  status: string;
  steps: Array<{
    id: string;
    type: string;
    status: string;
    skipReason?: string;
    error?: { message: string };
  }>;
}): string {
  const lines: string[] = [];
  const statusIcon = report.status === "succeeded" ? "+" : report.status === "failed" ? "x" : "~";
  lines.push(`\nPipeline ${report.status} [${statusIcon}]\n`);
  for (const step of report.steps) {
    const icon =
      step.status === "succeeded"
        ? "+"
        : step.status === "failed"
          ? "x"
          : step.status === "skipped"
            ? "-"
            : "~";
    let line = `  [${icon}] ${step.id} (${step.type}) — ${step.status}`;
    if (step.skipReason) line += ` (${step.skipReason})`;
    if (step.error) line += `: ${step.error.message}`;
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}
