import { defineCommand, detectOutputFormat, modelsLimitsPath } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { formatNumber } from "../shared/format.ts";

const MINUTE_SECONDS = 60;

export default defineCommand({
  description: "Update model rate limits (QPM/TPM), or clear them with --delete",
  auth: "apiKey",
  usageArgs: "--model <model> [--rpm <n>] [--tpm <n>] [--delete]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model name (required)",
      required: true,
    },
    rpm: {
      type: "number",
      valueHint: "<n>",
      description: "Max requests per minute (QPM)",
    },
    tpm: {
      type: "number",
      valueHint: "<n>",
      description: "Max tokens per minute (TPM)",
    },
    delete: {
      type: "switch",
      description: "Clear all custom rate limits for the model",
    },
  },
  exampleArgs: [
    "--model qwen-plus --rpm 60 --tpm 100000",
    "--model qwen3-max --tpm 500000",
    "--model qwen-plus --delete",
    "--model qwen-plus --rpm 60 --output json",
  ],
  notes: [
    "Fields you omit keep their current values (server-side OVERLAY merge); --delete clears all custom limits.",
    "Setting TPM without an existing QPM limit is rejected server-side — pass --rpm first or together.",
  ],
  validate: (flags) => {
    if (flags.delete && (flags.rpm !== undefined || flags.tpm !== undefined))
      return "--delete cannot be combined with --rpm/--tpm.";
    if (!flags.delete && flags.rpm === undefined && flags.tpm === undefined)
      return "one of --rpm / --tpm / --delete is required.";
    if (flags.rpm !== undefined && flags.rpm < 0) return "--rpm must be a non-negative number.";
    if (flags.tpm !== undefined && flags.tpm < 0) return "--tpm must be a non-negative number.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelName = flags.model;
    const format = detectOutputFormat(settings.output);

    const entry: Record<string, unknown> = { model: modelName };
    if (flags.delete) {
      entry.operation_type = "DELETE";
    } else {
      if (flags.rpm !== undefined) {
        entry.request_limit = flags.rpm;
        entry.request_limit_period = MINUTE_SECONDS;
      }
      if (flags.tpm !== undefined) {
        entry.usage_limit = flags.tpm;
        entry.usage_limit_period = MINUTE_SECONDS;
      }
    }
    const body = { models: [entry] };

    if (settings.dryRun) {
      emitResult(
        { endpoint: ctx.client.url(modelsLimitsPath()), method: "POST", request: body },
        format,
      );
      return;
    }

    const result = await ctx.client.requestJson<{ request_id?: string }>({
      path: modelsLimitsPath(),
      method: "POST",
      body,
    });

    if (format === "json") {
      emitResult({ model: modelName, ...result }, format);
      return;
    }

    if (flags.delete) {
      process.stdout.write(`Rate limits cleared for "${modelName}".\n`);
      return;
    }
    const parts: string[] = [];
    if (flags.rpm !== undefined) parts.push(`QPM ${formatNumber(flags.rpm)}`);
    if (flags.tpm !== undefined) parts.push(`TPM ${formatNumber(flags.tpm)}`);
    process.stdout.write(`Rate limits updated for "${modelName}": ${parts.join(", ")}\n`);
  },
});
