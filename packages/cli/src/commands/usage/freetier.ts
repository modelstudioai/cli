import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  fetchModelList,
  detectOutputFormat,
  type Config,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";

const ACTIVATE_API = "zeldaEasy.broadscope-bailian.freeTrial.batchActivateFreeTierOnly";
const DEACTIVATE_API = "zeldaEasy.broadscope-bailian.freeTrial.batchDeactivateFreeTierOnly";
const FREE_TIER_API = "zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota";
const FREE_TIER_ONLY_STATUS_API = "zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierOnlyStatus";

interface FreeTierQuota {
  model: string;
  quotaTotal: number;
  quotaInitTotal: number;
}

interface FreeTierOnlyStatus {
  model: string;
  freeTierOnly: boolean;
}

interface BatchResultFailure {
  failureModelId: string;
  errorCode: string;
}

function getNestedRecord(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const val = obj[key];
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  return undefined;
}

function extractResponseData(result: Record<string, unknown>): Record<string, unknown> {
  const data = getNestedRecord(result, "data");
  if (!data) return result;

  const dataV2 = getNestedRecord(data, "DataV2");
  if (dataV2) {
    const inner = getNestedRecord(dataV2, "data");
    const innerData = inner ? getNestedRecord(inner, "data") : undefined;
    return innerData ?? inner ?? dataV2;
  }

  const direct = getNestedRecord(data, "data");
  return direct ?? data;
}

const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 20;

async function pollUntilDone(
  config: Config,
  token: string,
  api: string,
  requestKey: string,
  models: string[],
): Promise<unknown> {
  let nextTaskId: string | undefined;

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const requestData = {
      [requestKey]: nextTaskId ? { taskId: nextTaskId } : { models },
    };

    const raw = await callConsoleGateway(config, token, {
      api,
      data: requestData,
    });

    const resp = extractResponseData(raw as Record<string, unknown>);
    if (resp.taskId && Object.keys(resp).length === 1) {
      nextTaskId = resp.taskId as string;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }
    return raw;
  }
  return null;
}

async function fetchAllModelNames(config: Config, token: string): Promise<string[]> {
  const allModels: Record<string, unknown>[] = [];
  let page = 1;
  while (true) {
    const result = await fetchModelList(config, token, { pageNo: page, pageSize: 50 });
    allModels.push(...result.models);
    if (allModels.length >= result.total) break;
    page++;
  }
  return allModels.map((item) => item.model as string).filter(Boolean);
}

export default defineCommand({
  name: "usage freetier",
  description:
    "Enable or disable auto-stop for free-tier models. Enables by default; use --off to disable",
  usage: "bl usage freetier <--model <model>[,model2,...] | --all> [--off] [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model name(s), comma-separated for multiple",
    },
    {
      flag: "--all",
      description: "Apply to all free-tier models",
    },
    {
      flag: "--on",
      description: "Enable auto-stop (default behavior)",
    },
    {
      flag: "--off",
      description: "Disable auto-stop",
    },
    { flag: "--console-region <region>", description: "Console region" },
    {
      flag: "--console-site <site>",
      description: "Console site: domestic, international",
    },
    {
      flag: "--console-switch-agent <uid>",
      description: "Switch agent UID",
      type: "number",
    },
  ],
  examples: [
    "bl usage freetier --model qwen3-max",
    "bl usage freetier --model qwen3-max,qwen-turbo",
    "bl usage freetier --all",
    "bl usage freetier --on --model qwen3-max",
    "bl usage freetier --off --model qwen3-max",
    "bl usage freetier --off --all",
  ],
  async run(config, flags) {
    const modelFlag = flags.model || undefined;
    const all = Boolean(flags.all);
    const off = Boolean(flags.off);
    const format = detectOutputFormat(config.output);

    if (!modelFlag && !all) {
      process.stderr.write(
        "Error: missing required flag. Specify --model <model>[,model2,...] or --all\n",
      );
      process.exit(1);
    }

    const credential = await resolveConsoleGatewayCredential(config);

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
      models = await fetchAllModelNames(config, credential.token);
    }

    const api = off ? DEACTIVATE_API : ACTIVATE_API;
    const requestKey = off
      ? "BatchDeactivateFreeTierOnlyRequest"
      : "BatchActivateFreeTierOnlyRequest";

    if (config.dryRun) {
      emitResult(
        {
          api,
          data: { [requestKey]: { models } },
          token: credential.token.slice(0, 8) + "...",
        },
        format,
      );
      return;
    }

    if (off) {
      const [quotaResult, stopResult] = await Promise.all([
        callConsoleGateway(config, credential.token, {
          api: FREE_TIER_API,
          data: { queryFreeTierQuotaRequest: { models } },
        }),
        callConsoleGateway(config, credential.token, {
          api: FREE_TIER_ONLY_STATUS_API,
          data: { queryFreeTierOnlyStatusRequest: { models } },
        }),
      ]);

      const quotaData = extractResponseData(quotaResult as Record<string, unknown>);
      const quotas = (quotaData.freeTierQuotas ?? []) as FreeTierQuota[];
      const quotaMap = new Map(quotas.map((quota) => [quota.model, quota]));

      const stopData = extractResponseData(stopResult as Record<string, unknown>);
      const stopStatuses = (stopData.freeTierOnlyStatuses ?? []) as FreeTierOnlyStatus[];
      const stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));

      for (const name of models) {
        if (stopMap.get(name) === false) {
          process.stderr.write(`Auto-stop is already disabled for "${name}".\n`);
          continue;
        }
        const quota = quotaMap.get(name);
        if (quota && quota.quotaTotal > 0 && stopMap.get(name) === true) {
          process.stderr.write(
            `Cannot disable auto-stop for "${name}": free-tier quota has not been fully consumed. Please disable auto-stop after the quota is exhausted.\n`,
          );
          continue;
        }
        await pollUntilDone(config, credential.token, api, requestKey, [name]);
        process.stdout.write(`Disabled auto-stop for "${name}".\n`);
      }
      return;
    }

    const jsonResults: unknown[] = [];
    for (const name of models) {
      const result = await pollUntilDone(config, credential.token, api, requestKey, [name]);
      if (format === "json") {
        jsonResults.push(result);
        continue;
      }
      if (result) {
        const resultData = extractResponseData(result as Record<string, unknown>);
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
