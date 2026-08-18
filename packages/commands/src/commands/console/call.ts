import {
  defineCommand,
  UsageError,
  effectiveConsoleGatewayConfig,
  detectOutputFormat,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Call a Bailian console API via the CLI gateway",
    "zh-CN": "通过 CLI Gateway 调用百炼控制台 API",
  },
  auth: "console",
  usageArgs: "--api <api> --data <json> [flags]",
  flags: {
    api: {
      type: "string",
      valueHint: "<api>",
      description: {
        "en-US": "API name (e.g. zeldaEasy.broadscope-bailian.memory-library.getLibraries)",
        "zh-CN": "API 名称（例如 zeldaEasy.broadscope-bailian.memory-library.getLibraries）",
      },
      required: true,
    },
    data: {
      type: "string",
      valueHint: "<json>",
      description: { "en-US": "Request data as JSON string", "zh-CN": "JSON 字符串格式的请求数据" },
      required: true,
    },
  },
  exampleArgs: [
    `--api zeldaEasy.bailian-commerce.freeTrial.queryFreeTierQuota --data '{"queryFreeTierQuotaRequest":{"models":["qwen3-max"]}}'`,
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
