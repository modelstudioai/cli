import {
  defineCommand,
  callConsoleGateway,
  effectiveConsoleGatewayConfig,
  resolveConsoleGatewayCredential,
  CONSOLE_GATEWAY_NO_TOKEN_MESSAGE,
  BailianError,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult } from "../../output/output.ts";

export default defineCommand({
  name: "console call",
  description: "Call a Bailian console API via the CLI gateway",
  usage: "bl console call --api <api> --data <json> [flags]",
  options: [
    {
      flag: "--api <api>",
      description: "API name (e.g. zeldaEasy.broadscope-bailian.memory-library.getLibraries)",
      required: true,
    },
    {
      flag: "--data <json>",
      description: "Request data as JSON string",
      required: true,
    },
  ],
  examples: [
    `bl console call --api zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota --data '{"queryFreeTierQuotaRequest":{"models":["qwen3-max"]}}'`,
    `bl console call --api some.api.name --data '{"key":"value"}' --console-region cn-beijing`,
  ],
  async run(config: Config, flags: GlobalFlags) {
    const api = flags.api as string;
    if (!api) failIfMissing("api", "bl console call --api <api> --data <json>");

    const dataRaw = flags.data as string;
    if (!dataRaw) failIfMissing("data", "bl console call --api <api> --data <json>");

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
