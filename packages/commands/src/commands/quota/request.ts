import {
  defineCommand,
  UsageError,
  BailianError,
  ExitCode,
  detectOutputFormat,
  type Client,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";

const MODEL_LIST_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";
const UPDATE_LIMITS_API = "zeldaEasy.broadscope-platform.modelInstance.updateFoundationModelLimits";

interface QpmInfoItem {
  count_limit: number;
  count_limit_period: number;
  usage_limit: number;
  usage_limit_period: number;
  usage_limit_field: string;
  type: string;
}

function calculateTPM(item: QpmInfoItem | undefined, fallbackPeriod?: number): number {
  if (!item) return 0;
  const period = item.usage_limit_period || fallbackPeriod;
  if (!period) return 0;
  return Math.floor((item.usage_limit * 60) / period);
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

async function fetchModelQpmInfo(
  client: Client,
  modelName: string,
): Promise<{ model: string; qpmInfo: Record<string, QpmInfoItem> } | undefined> {
  const raw = await client.console(MODEL_LIST_API, {
    input: {
      pageNo: 1,
      pageSize: 50,
      name: modelName,
      group: false,
      queryQpmInfo: true,
      ignoreWorkspaceServiceSite: true,
      supports: { selfServiceLimitIncrease: true },
    },
  });

  const resp = extractResponseData(raw as Record<string, unknown>);
  const list = (resp.list as Array<{ model: string; qpmInfo?: Record<string, QpmInfoItem> }>) ?? [];
  return list.find((m) => m.model === modelName && m.qpmInfo) as
    | { model: string; qpmInfo: Record<string, QpmInfoItem> }
    | undefined;
}

export default defineCommand({
  description: "Request a temporary quota increase",
  auth: "console",
  usageArgs: "--model <model> --tpm <value> [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model name (required)",
      required: true,
    },
    tpm: {
      type: "string",
      valueHint: "<value>",
      description: "Target TPM value (required)",
      required: true,
    },
    yes: { type: "switch", description: "Skip downgrade confirmation" },
    consoleRegion: { type: "string", valueHint: "<region>", description: "Console region" },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      description: "Console site: domestic, international",
    },
    consoleSwitchAgent: { type: "number", valueHint: "<uid>", description: "Switch agent UID" },
  },
  exampleArgs: [
    "--model qwen-turbo --tpm 100000",
    "--model qwen3.6-plus --tpm 8000000 --yes",
    "--model qwen-turbo --tpm 100000 --output json",
  ],
  validate: (f) => (Number(f.tpm) > 0 ? undefined : "--tpm must be a positive number."),
  async run(ctx) {
    const { config, flags } = ctx;
    const modelName = flags.model;
    const tpmValue = Number(flags.tpm);
    const autoConfirm = Boolean(flags.yes) || config.yes;
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      const requestData = {
        input: {
          model: modelName,
          limit: { usage_limit: tpmValue },
        },
      };
      emitResult({ api: UPDATE_LIMITS_API, data: requestData }, format);
      return;
    }

    const modelInfo = await fetchModelQpmInfo(ctx.client, modelName);
    if (!modelInfo) {
      throw new BailianError(
        `model "${modelName}" not found or does not support self-service quota increase.`,
        ExitCode.GENERAL,
        `Run \`${config.binName} quota list\` to view available models.`,
      );
    }

    const modelDefault = modelInfo.qpmInfo["model-default"];
    const userSpec = modelInfo.qpmInfo["user-spec"];
    const minLimit = calculateTPM(modelDefault);
    const currentLimit = calculateTPM(userSpec, modelDefault?.usage_limit_period) || minLimit;
    const maxLimit = minLimit * 2;

    if (tpmValue < minLimit || tpmValue > maxLimit) {
      throw new UsageError(
        `TPM value ${tpmValue.toLocaleString()} is out of range. ` +
          `Current: ${currentLimit.toLocaleString()}, Range: ${minLimit.toLocaleString()} ~ ${maxLimit.toLocaleString()}.`,
      );
    }

    const requestData = {
      input: {
        model: modelName,
        limit: { usage_limit: tpmValue },
        originalQpmInfo: modelInfo.qpmInfo,
      } as Record<string, unknown>,
    };

    const submitRequest = async (confirmedDowngrade?: boolean): Promise<unknown> => {
      if (confirmedDowngrade) {
        requestData.input.confirmedDowngrade = true;
      }
      try {
        return await ctx.client.console(UPDATE_LIMITS_API, requestData);
      } catch (err) {
        if (err instanceof BailianError && err.message.includes("NotLogined")) {
          throw new BailianError(
            "session expired.",
            ExitCode.AUTH,
            `Run \`${config.binName} auth login --console\` to re-authenticate.`,
          );
        }
        throw err;
      }
    };

    let result = await submitRequest();
    const resp = extractResponseData(result as Record<string, unknown>);

    if (resp.needConfirm) {
      const confirmCode = resp.confirmCode as string;

      if (confirmCode === "Refresh_Required") {
        throw new BailianError("rate limit has been updated externally. Please retry.");
      }

      if (confirmCode === "Downgrade") {
        if (!autoConfirm) {
          throw new BailianError(
            `target TPM (${tpmValue.toLocaleString()}) is lower than current (${currentLimit.toLocaleString()}).`,
            ExitCode.GENERAL,
            "Use --yes to confirm downgrade.",
          );
        }
        result = await submitRequest(true);
      }
    }

    if (format === "json") {
      emitResult(result, format);
      return;
    }

    process.stdout.write(
      `Quota updated for "${modelName}": TPM ${currentLimit.toLocaleString()} → ${tpmValue.toLocaleString()}\n`,
    );
  },
});
