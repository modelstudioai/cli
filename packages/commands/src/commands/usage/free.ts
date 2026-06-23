import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  fetchModelList,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";

const FREE_TIER_API = "zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierQuota";
const FREE_TIER_ONLY_STATUS_API = "zeldaEasy.broadscope-bailian.freeTrial.queryFreeTierOnlyStatus";

interface FreeTierQuota {
  model: string;
  quotaInitTotal: number;
  quotaTotal: number;
  quotaValidityPeriod: number;
  quotaStatus: string;
}

interface FreeTierOnlyStatus {
  model: string;
  freeTierOnly: boolean;
}

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUsage(quota: FreeTierQuota): string {
  if (!quota.quotaInitTotal) return "-";
  const used = quota.quotaInitTotal - quota.quotaTotal;
  const percent = (used / quota.quotaInitTotal) * 100;
  return `${percent.toFixed(1)}%`;
}

const CAPABILITY_TO_TYPE: Record<string, string> = {
  Reasoning: "Text",
  TG: "Text",
  VU: "Text",
  IG: "Vision",
  VG: "Vision",
  "Realtime-Omni": "Multimodal",
  "Multimodal-Omni": "Multimodal",
  ASR: "Audio",
  TTS: "Audio",
  "Voice-Replication": "Audio",
  "Realtime-Text-to-Speech": "Audio",
  "Realtime-Voice-Replication": "Audio",
  "Realtime-ASR": "Audio",
  "Realtime-Audio-Translate": "Audio",
  ME: "Embedding",
  TR: "Embedding",
};

function resolveModelType(capabilities: string[]): string {
  for (const cap of capabilities) {
    const type = CAPABILITY_TO_TYPE[cap];
    if (type) return type;
  }
  return "-";
}

function printTable(
  quotas: FreeTierQuota[],
  stopMap: Map<string, boolean>,
  typeMap: Map<string, string>,
  noColor: boolean,
): void {
  const headers = ["Model", "Type", "Remaining/Total", "Usage", "Expires", "Auto-Stop"];

  const rows = quotas.map((quota) => {
    const hasQuota = quota.quotaInitTotal != null && quota.quotaTotal != null;
    const remaining = hasQuota ? formatNumber(quota.quotaTotal) : "-";
    const total = hasQuota ? formatNumber(quota.quotaInitTotal) : "-";
    const stopStatus = stopMap.get(quota.model);
    return [
      quota.model,
      typeMap.get(quota.model) || "-",
      hasQuota ? `${remaining} / ${total}` : "-",
      formatUsage(quota),
      quota.quotaValidityPeriod ? formatDate(quota.quotaValidityPeriod) : "-",
      quota.quotaStatus === "UNKNOWN"
        ? "Unsupported"
        : stopStatus === true
          ? "ON"
          : stopStatus === false
            ? "OFF"
            : "-",
    ];
  });

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const dim = noColor ? (text: string) => text : (text: string) => `\x1b[2m${text}\x1b[0m`;
  const bold = noColor ? (text: string) => text : (text: string) => `\x1b[1m${text}\x1b[0m`;
  const green = noColor ? (text: string) => text : (text: string) => `\x1b[32m${text}\x1b[0m`;
  const yellow = noColor ? (text: string) => text : (text: string) => `\x1b[33m${text}\x1b[0m`;

  const autoStopCol = headers.length - 1;
  const headerLine = headers.map((label, col) => bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((width) => dim("─".repeat(width))).join("──");

  process.stdout.write(headerLine + "\n");
  process.stdout.write(separator + "\n");

  for (const row of rows) {
    const cells = row.map((cell, col) => {
      if (col === autoStopCol) {
        if (cell === "ON") return green(padEnd(cell, widths[col]));
        if (cell === "OFF") return yellow(padEnd(cell, widths[col]));
      }
      return padEnd(cell, widths[col]);
    });
    process.stdout.write(cells.join("  ") + "\n");
  }
}

function extractQuotas(result: unknown): FreeTierQuota[] {
  const root = result as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  if (!data) return [];

  const dataV2 = data.DataV2 as Record<string, unknown> | undefined;
  if (dataV2) {
    const inner = dataV2.data as Record<string, unknown> | undefined;
    const innerData = inner?.data as Record<string, unknown> | undefined;
    return (innerData?.freeTierQuotas as FreeTierQuota[]) || [];
  }

  const direct = data.data as Record<string, unknown> | undefined;
  return (direct?.freeTierQuotas as FreeTierQuota[]) || [];
}

function extractFreeTierOnlyStatuses(result: unknown): FreeTierOnlyStatus[] {
  const root = result as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  if (!data) return [];

  const dataV2 = data.DataV2 as Record<string, unknown> | undefined;
  if (dataV2) {
    const inner = dataV2.data as Record<string, unknown> | undefined;
    const innerData = inner?.data as Record<string, unknown> | undefined;
    return (innerData?.freeTierOnlyStatuses as FreeTierOnlyStatus[]) || [];
  }

  const direct = data.data as Record<string, unknown> | undefined;
  return (direct?.freeTierOnlyStatuses as FreeTierOnlyStatus[]) || [];
}

interface ModelInfo {
  name: string;
  type: string;
}

async function fetchAllModels(config: Config, token: string): Promise<ModelInfo[]> {
  const allModels: Record<string, unknown>[] = [];
  let page = 1;
  while (true) {
    const result = await fetchModelList(config, token, { pageNo: page, pageSize: 50 });
    allModels.push(...result.models);
    if (allModels.length >= result.total) break;
    page++;
  }
  return allModels
    .filter((item) => typeof item.model === "string" && item.model)
    .map((item) => ({
      name: item.model as string,
      type: resolveModelType((item.capabilities as string[]) || []),
    }));
}

export default defineCommand({
  name: "usage free",
  description: "Query free-tier quota for models (all models if --model is omitted)",
  skipDefaultApiKeySetup: true,
  usage: "bl usage free [--model <model>[,model2,...]] [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model name(s) to query, comma-separated for multiple; omit for all models",
    },
    {
      flag: "--expiring <days>",
      description: "Only show quotas expiring within N days",
    },
    {
      flag: "--sort <field>",
      description: "Sort by: remaining (ascending), expires (ascending)",
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
    "bl usage free",
    "bl usage free --model qwen3-max",
    "bl usage free --model qwen3-max,qwen-turbo",
    "bl usage free --expiring 30",
    "bl usage free --sort remaining",
    "bl usage free --model qwen-turbo --output json",
    "bl usage free --model qwen3-max --console-region cn-beijing",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const modelFlag = (flags.model as string) || undefined;
    const expiringDays = Number(flags.expiring) || 0;
    const VALID_SORT_FIELDS = ["remaining", "expires"] as const;
    const sortField = (flags.sort as string) || undefined;
    if (sortField && !VALID_SORT_FIELDS.includes(sortField as (typeof VALID_SORT_FIELDS)[number])) {
      process.stderr.write(
        `Error: invalid --sort value "${sortField}". Must be one of: ${VALID_SORT_FIELDS.join(", ")}\n`,
      );
      process.exit(1);
    }
    const format = detectOutputFormat(config.output);

    let models: string[];
    const typeMap = new Map<string, string>();

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

    const requestData = {
      queryFreeTierQuotaRequest: { models },
    };

    if (config.dryRun) {
      emitResult(
        {
          api: FREE_TIER_API,
          data: requestData,
        },
        format,
      );
      return;
    }

    const credential = await resolveConsoleGatewayCredential(config);

    if (!modelFlag) {
      const modelInfos = await fetchAllModels(config, credential.token);
      models = modelInfos.map((info) => info.name);
      for (const info of modelInfos) {
        typeMap.set(info.name, info.type);
      }
      requestData.queryFreeTierQuotaRequest.models = models;
    } else {
      const searchResults = await Promise.all(
        models.map((name) => fetchModelList(config, credential.token, { name, pageSize: 50 })),
      );
      for (let idx = 0; idx < models.length; idx++) {
        const matched = searchResults[idx].models.find((item) => item.model === models[idx]);
        if (matched) {
          typeMap.set(models[idx], resolveModelType((matched.capabilities as string[]) || []));
        }
      }
    }

    const [quotaResult, stopResult] = await Promise.all([
      callConsoleGateway(config, credential.token, {
        api: FREE_TIER_API,
        data: requestData,
      }),
      callConsoleGateway(config, credential.token, {
        api: FREE_TIER_ONLY_STATUS_API,
        data: { queryFreeTierOnlyStatusRequest: { models } },
      }),
    ]);

    const allQuotas = extractQuotas(quotaResult);
    let quotas = modelFlag
      ? allQuotas
      : allQuotas.filter((quota) => quota.quotaStatus === "VALID" && quota.quotaInitTotal > 0);

    if (expiringDays > 0) {
      const cutoff = Date.now() + expiringDays * 24 * 60 * 60 * 1000;
      quotas = quotas.filter((q) => q.quotaValidityPeriod > 0 && q.quotaValidityPeriod <= cutoff);
    }

    if (sortField === "remaining") {
      quotas.sort((a, b) => {
        const pctA = a.quotaInitTotal ? a.quotaTotal / a.quotaInitTotal : 0;
        const pctB = b.quotaInitTotal ? b.quotaTotal / b.quotaInitTotal : 0;
        return pctA - pctB;
      });
    } else if (sortField === "expires") {
      quotas.sort((a, b) => (a.quotaValidityPeriod ?? 0) - (b.quotaValidityPeriod ?? 0));
    }

    const stopStatuses = extractFreeTierOnlyStatuses(stopResult);
    const stopMap = new Map(stopStatuses.map((status) => [status.model, status.freeTierOnly]));

    if (format === "json") {
      const items = quotas.map((quota) => {
        const hasQuota = quota.quotaInitTotal != null && quota.quotaTotal != null;
        const used = hasQuota ? quota.quotaInitTotal - quota.quotaTotal : 0;
        const stopStatus = stopMap.get(quota.model);
        const autoStop =
          quota.quotaStatus === "UNKNOWN"
            ? "unsupported"
            : stopStatus === true
              ? true
              : stopStatus === false
                ? false
                : null;
        return {
          model: quota.model,
          type: typeMap.get(quota.model) || null,
          remaining: hasQuota ? quota.quotaTotal : null,
          total: hasQuota ? quota.quotaInitTotal : null,
          usagePercent:
            hasQuota && quota.quotaInitTotal > 0
              ? Math.round((used / quota.quotaInitTotal) * 1000) / 10
              : null,
          expires: quota.quotaValidityPeriod ? formatDate(quota.quotaValidityPeriod) : null,
          autoStop,
        };
      });
      emitResult(items, format);
      return;
    }

    if (quotas.length === 0) {
      process.stdout.write("No free-tier quota found.\n");
      return;
    }

    printTable(quotas, stopMap, typeMap, config.noColor);
  },
});
