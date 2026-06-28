import {
  defineCommand,
  callConsoleGateway,
  effectiveConsoleGatewayConfig,
  resolveConsoleGatewayCredential,
  CONSOLE_GATEWAY_NO_TOKEN_MESSAGE,
  BailianError,
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
  async run(config, flags) {
    const api = flags.api;
    const dataRaw = flags.data;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataRaw) as Record<string, unknown>;
    } catch {
      process.stderr.write("Error: --data must be valid JSON\n");
      process.exit(1);
    }

    const format = detectOutputFormat(config.output);

    let token: string | undefined;
    try {
      token = (await resolveConsoleGatewayCredential(config)).token;
    } catch (err) {
      if (!(err instanceof BailianError && err.message === CONSOLE_GATEWAY_NO_TOKEN_MESSAGE)) {
        throw err;
      }
    }

    if (config.dryRun) {
      emitResult(
        {
          api,
          data,
          token: token ? token.slice(0, 8) + "..." : null,
          ...effectiveConsoleGatewayConfig(config),
        },
        format,
      );
      return;
    }

    const result = await callConsoleGateway(config, token, {
      api,
      data,
    });

    emitResult(result, format);
  },
});
