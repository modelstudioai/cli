import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  FREE_TIER_ONLY_STATUS_API,
  extractFreeTierOnlyStatuses,
  fetchAllModels,
  pollFreeTierBatch,
} from "./shared.ts";

const ACTIVATE_API = "zeldaEasy.bailian-commerce.freeTrial.batchActivateFreeTierOnly";
const DEACTIVATE_API = "zeldaEasy.bailian-commerce.freeTrial.batchDeactivateFreeTierOnly";

interface BatchResultFailure {
  failureModelId: string;
  errorCode: string;
}

export default defineCommand({
  description:
    "Enable or disable auto-stop for free-tier models. Enables by default; use --off to disable",
  auth: "console",
  usageArgs: "<--model <model>[,model2,...] | --all> [--off] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model name(s), comma-separated for multiple",
    },
    all: {
      type: "switch",
      description: "Apply to all free-tier models",
    },
    on: {
      type: "switch",
      description: "Enable auto-stop (default behavior)",
    },
    off: {
      type: "switch",
      description: "Disable auto-stop",
    },
  },
  exampleArgs: [
    "--model qwen3-max",
    "--model qwen3-max,qwen-turbo",
    "--all",
    "--on --model qwen3-max",
    "--off --model qwen3-max",
    "--off --all",
  ],
  validate: (f) =>
    !f.model && !f.all ? "Provide --model <model>[,model2,...] or --all." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const off = Boolean(flags.off);
    const format = detectOutputFormat(settings.output);

    let models: string[];
    if (modelFlag) {
      models = [
        ...new Set(
          modelFlag
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];
    } else {
      models = [];
    }

    const api = off ? DEACTIVATE_API : ACTIVATE_API;
    const requestKey = off
      ? "BatchDeactivateFreeTierOnlyRequest"
      : "BatchActivateFreeTierOnlyRequest";

    if (settings.dryRun) {
      emitResult(
        {
          api,
          data: { [requestKey]: { models } },
        },
        format,
      );
      return;
    }

    if (!modelFlag) {
      models = (await fetchAllModels(ctx.client)).map((model) => model.name);
    }

    if (off) {
      const stopResult = await ctx.client.console(FREE_TIER_ONLY_STATUS_API, {
        queryFreeTierOnlyStatusRequest: { models },
      });

      const stopStatuses = extractFreeTierOnlyStatuses(stopResult);
      const stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));

      for (const name of models) {
        if (stopMap.get(name) === false) {
          process.stderr.write(`Auto-stop is already disabled for "${name}".\n`);
          continue;
        }
        await pollFreeTierBatch(ctx.client, api, requestKey, [name]);
        process.stdout.write(`Disabled auto-stop for "${name}".\n`);
      }
      return;
    }

    const jsonResults: unknown[] = [];
    for (const name of models) {
      const result = await pollFreeTierBatch(ctx.client, api, requestKey, [name]);
      if (format === "json") {
        jsonResults.push(result);
        continue;
      }
      if (result) {
        const resultData = unwrapResponse(result as Record<string, unknown>);
        const failureModels = (resultData.failureModels as BatchResultFailure[]) ?? [];
        if (failureModels.length > 0) {
          process.stderr.write(
            `Failed to enable auto-stop for "${name}" (${failureModels[0].errorCode}).\n`,
          );
        } else {
          process.stdout.write(`Enabled auto-stop for "${name}".\n`);
        }
      } else {
        process.stderr.write(`Warning: operation timed out for "${name}".\n`);
      }
    }
    if (format === "json") {
      emitResult(jsonResults, format);
    }
  },
});
