import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineCommand, type Config, type GlobalFlags } from "bailian-cli-core";
import { emitResult, cmdUsage } from "bailian-cli-runtime";
import { initPipelineSteps } from "bailian-cli-runtime";
import { executePipeline, streamPipelineEvents } from "bailian-cli-runtime";
import type { PipelineLifecycleEvent } from "bailian-cli-runtime";
import { loadPipelineFile } from "./load-file.ts";

export default defineCommand({
  description: "Run a pipeline workflow definition",
  auth: "none",
  usageArgs: "<file> [flags]",
  options: [
    { flag: "--input <json>", description: "Runtime input as inline JSON" },
    { flag: "--input-file <path>", description: "Runtime input from a JSON file" },
    {
      flag: "--concurrency <n>",
      description: "Max parallel steps (default: 1)",
      type: "number",
    },
    { flag: "--events <format>", description: "Emit lifecycle events: jsonl" },
    {
      flag: "--timeout <seconds>",
      description: "Default step timeout in seconds",
      type: "number",
    },
  ],
  exampleArgs: [
    'workflow.yaml --input \'{"brief":"hello"}\'',
    "workflow.json --input-file inputs.json --concurrency 3",
    "workflow.yaml --dry-run",
    "workflow.json --events jsonl",
    "workflow.yaml --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const file = ((flags._positional as string[] | undefined) ?? [])[0] as string | undefined;
    if (!file) {
      process.stderr.write(
        `Error: pipeline file is required\nUsage: ${cmdUsage(config, "<file>")}\n`,
      );
      process.exit(2);
    }

    initPipelineSteps();

    const eventsFormat = flags.events as string | undefined;
    if (eventsFormat !== undefined && eventsFormat !== "jsonl") {
      process.stderr.write(
        `Error: unsupported --events format: ${eventsFormat}. Supported: jsonl\n`,
      );
      process.exit(2);
    }

    const filePath = resolve(file);
    const pipeline = await loadPipelineFile(filePath);
    const runtimeInput = await resolveRuntimeInput(flags);
    const basePath = dirname(filePath);

    if (eventsFormat === "jsonl") {
      for await (const event of streamPipelineEvents(pipeline, runtimeInput, {
        concurrency: flags.concurrency as number | undefined,
        basePath,
        dryRun: flags.dryRun,
        timeoutSeconds: flags.timeout as number | undefined,
      })) {
        process.stdout.write(JSON.stringify(event) + "\n");
      }
      return;
    }

    const report = await executePipeline(pipeline, runtimeInput, {
      concurrency: flags.concurrency as number | undefined,
      basePath,
      dryRun: flags.dryRun,
      timeoutSeconds: flags.timeout as number | undefined,
      onEvent: flags.verbose ? logEvent : undefined,
    });

    if (config.output === "json") {
      emitResult(report, "json");
    } else {
      printTextReport(report);
    }

    if (report.status === "failed") process.exitCode = 1;
  },
});

async function resolveRuntimeInput(flags: GlobalFlags): Promise<Record<string, unknown>> {
  const inputJson = flags.input as string | undefined;
  const inputFile = flags.inputFile as string | undefined;
  if (inputJson && inputFile) {
    process.stderr.write("Error: use --input or --input-file, not both\n");
    process.exit(2);
  }
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
