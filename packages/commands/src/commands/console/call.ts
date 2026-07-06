import {
  defineCommand,
  UsageError,
  effectiveConsoleGatewayConfig,
  detectOutputFormat,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: "Call a Bailian console API via the CLI gateway",
  auth: "console",
  usageArgs: "--api <api> --data <json> [flags]",
  flags: {
    api: {
      type: "string",
      valueHint: "<api>",
      description: "API name (e.g. zeldaEasy.broadscope-bailian.memory-library.getLibraries)",
      required: true,
    },
    data: {
      type: "string",
      valueHint: "<json>",
      description: "Request data as JSON string",
      required: true,
    },
    consoleRegion: { type: "string", valueHint: "<region>", description: "Console region" },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      description: "Console site: domestic, international",
    },
    consoleSwitchAgent: { type: "number", valueHint: "<uid>", description: "Switch agent UID" },
  },
  exampleArgs: [
    `--api zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota --data '{"queryFreeTierQuotaRequest":{"models":["qwen3-max"]}}'`,
    `--api some.api.name --data '{"key":"value"}' --console-region cn-beijing`,
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const api = flags.api;
    const dataRaw = flags.data;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataRaw) as Record<string, unknown>;
    } catch {
      throw new UsageError("--data must be valid JSON");
    }

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          api,
          data,
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    const result = await ctx.client.console(api, data);

    emitResult(result, format);
  },
});
