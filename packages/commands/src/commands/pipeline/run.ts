import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineCommand, type FlagsDef, type ParsedFlags } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { initPipelineSteps } from "bailian-cli-runtime";
import { executePipeline, streamPipelineEvents } from "bailian-cli-runtime";
import type { PipelineLifecycleEvent } from "bailian-cli-runtime";
import { loadPipelineFile } from "./load-file.ts";

const RUN_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Pipeline definition file (YAML/JSON)",
    required: true,
  },
  input: { type: "string", valueHint: "<json>", description: "Runtime input as inline JSON" },
  inputFile: {
    type: "string",
    valueHint: "<path>",
    description: "Runtime input from a JSON file",
  },
  concurrency: {
    type: "number",
    valueHint: "<n>",
    description: "Max parallel steps (default: 1)",
  },
  events: {
    type: "string",
    valueHint: "<format>",
    description: "Emit lifecycle events: jsonl",
    choices: ["jsonl"] as const,
  },
  stepTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: "Default step timeout in seconds",
  },
} satisfies FlagsDef;
type RunFlags = ParsedFlags<typeof RUN_FLAGS>;

export default defineCommand({
  description: "Run a pipeline workflow definition",
  auth: "none",
  usageArgs: "--file <path> [flags]",
  flags: RUN_FLAGS,
  exampleArgs: [
    '--file workflow.yaml --input \'{"brief":"hello"}\'',
    "--file workflow.json --input-file inputs.json --concurrency 3",
    "--file workflow.yaml --dry-run",
    "--file workflow.json --events jsonl",
    "--file workflow.yaml --output json",
  ],
  validate: (f) => (f.input && f.inputFile ? "use --input or --input-file, not both" : undefined),
  async run(ctx) {
    const { settings, flags } = ctx;
    const file = flags.file;

    initPipelineSteps();

    const eventsFormat = flags.events;

    const filePath = resolve(file);
    const pipeline = await loadPipelineFile(filePath);
    const runtimeInput = await resolveRuntimeInput(flags);
    const basePath = dirname(filePath);

    if (eventsFormat === "jsonl") {
      for await (const event of streamPipelineEvents(pipeline, runtimeInput, {
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
      concurrency: flags.concurrency,
      basePath,
      dryRun: settings.dryRun,
      timeoutSeconds: flags.stepTimeout,
      onEvent: settings.verbose ? logEvent : undefined,
    });

    if (settings.output === "json") {
      emitResult(report, "json");
    } else {
      printTextReport(report);
    }

    if (report.status === "failed") process.exitCode = 1;
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

function logEvent(event: PipelineLifecycleEvent): void {
  const prefix = `[${event.type}]`;
  if ("stepCount" in event) {
    process.stderr.write(`${prefix} ${event.stepCount} step${event.stepCount === 1 ? "" : "s"}\n`);
    return;
  }
  if ("step" in event && event.step) {
    process.stderr.write(`${prefix} ${formatStep(event.step)}\n`);
  } else {
    process.stderr.write(`${prefix}\n`);
  }
}

function formatStep(step: { id: string; type: string; index?: number; total?: number }): string {
  const progress =
    step.index !== undefined && step.total !== undefined ? `${step.index}/${step.total} ` : "";
  return `${progress}${step.id} (${step.type})`;
}

function printTextReport(report: {
  status: string;
  steps: Array<{
    id: string;
    type: string;
    status: string;
    skipReason?: string;
    error?: { message: string };
  }>;
}): void {
  const statusIcon = report.status === "succeeded" ? "+" : report.status === "failed" ? "x" : "~";
  process.stdout.write(`\nPipeline ${report.status} [${statusIcon}]\n\n`);
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
    process.stdout.write(line + "\n");
  }
  process.stdout.write("\n");
}
