import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult } from "../../output/output.ts";

const FREE_TIER_API = "zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota";

export default defineCommand({
  name: "usage free",
  description: "Query free-tier quota for a model",
  usage: "bl usage free --model <model> [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model name to query (e.g. qwen3-vl-plus, qwen-turbo)",
      required: true,
    },
    {
      flag: "--region <region>",
      description: "API region (default: cn-beijing)",
    },
  ],
  examples: [
    "bl usage free --model qwen3-vl-plus",
    "bl usage free --model qwen-turbo --output json",
    "bl usage free --model qwen3-vl-plus --region cn-beijing",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const model = flags.model as string;
    if (!model) failIfMissing("model", "bl usage free --model <model>");

    const region = (flags.region as string) || "cn-beijing";
    const format = detectOutputFormat(config.output);

    const credential = await resolveConsoleGatewayCredential(config);

    const data = {
      queryFreeTierQuotaRequest: {
        models: [model],
      },
    };

    if (config.dryRun) {
      emitResult(
        { api: FREE_TIER_API, data, region, token: credential.token.slice(0, 8) + "..." },
        format,
      );
      return;
    }

    const result = await callConsoleGateway(config, credential.token, {
      api: FREE_TIER_API,
      data,
      region,
    });

    emitResult(result, format);
  },
});
