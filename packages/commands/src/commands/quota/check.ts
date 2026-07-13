import {
  defineCommand,
  effectiveConsoleGatewayConfig,
  detectOutputFormat,
  type Client,
} from "bailian-cli-core";
import { ansi, emitResult, renderBoxTable } from "bailian-cli-runtime";

const MODEL_LIST_API = "zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listFoundationModels";
const MONITOR_API = "zeldaEasy.bailian-telemetry.monitor.getMonitorData";

interface QpmInfoItem {
  count_limit: number;
  count_limit_period: number;
  usage_limit: number;
  usage_limit_period: number;
  usage_limit_field: string;
  type: string;
}

interface ModelWithQpm {
  model: string;
  qpmInfo?: Record<string, QpmInfoItem>;
}

interface MonitorPoint {
  value: number;
  timestamp: number;
}

interface MonitorMetric {
  aggMethod: string;
  metricName: string;
  points: MonitorPoint[];
}

function calculateRPM(item: QpmInfoItem | undefined, fallbackPeriod?: number): number {
  if (!item) return 0;
  const period = item.count_limit_period || fallbackPeriod;
  if (!period) return 0;
  return Math.floor((item.count_limit * 60) / period);
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

async function fetchAllModelsWithQpm(client: Client): Promise<ModelWithQpm[]> {
  const allModels: ModelWithQpm[] = [];
  let pageNo = 1;

  while (true) {
    const raw = await client.console(MODEL_LIST_API, {
      input: {
        pageNo,
        pageSize: 50,
        group: false,
        queryQpmInfo: true,
        ignoreWorkspaceServiceSite: true,
        supports: { selfServiceLimitIncrease: true },
      },
    });

    const resp = extractResponseData(raw as Record<string, unknown>);
    const list = (resp.list as ModelWithQpm[]) ?? [];
    const total = (resp.total as number) ?? 0;

    allModels.push(...list);
    if (allModels.length >= total || list.length === 0) break;
    pageNo++;
  }

  return allModels;
}

async function fetchMonitorData(
  client: Client,
  modelName: string,
  windowMinutes: number,
): Promise<{ rpm: number; tpm: number }> {
  const now = Date.now();
  const startTime = now - windowMinutes * 60 * 1000;

  try {
    const raw = await client.console(MONITOR_API, {
      reqDTO: {
        monitorType: "Advanced",
        metricFilters: [
          { aggMethod: "sum_pm", metricName: "model_total_amount" },
          { aggMethod: "sum_pm", metricName: "model_call_count" },
        ],
        labelFilters: {
          resourceId: modelName,
          resourceType: "model",
        },
        startTime,
        endTime: now,
      },
    });

    const resp = extractResponseData(raw as Record<string, unknown>);
    const metrics = (resp.data ?? resp) as MonitorMetric[] | Record<string, unknown>;
    if (!Array.isArray(metrics)) return { rpm: 0, tpm: 0 };

    let rpm = 0;
    let tpm = 0;

    for (const metric of metrics) {
      if (metric.aggMethod !== "sum_pm" || !metric.points?.length) continue;
      const lastValue = metric.points[metric.points.length - 1].value ?? 0;
      if (metric.metricName === "model_call_count") rpm = Math.round(lastValue);
      if (metric.metricName === "model_total_amount") tpm = Math.round(lastValue);
    }

    return { rpm, tpm };
  } catch (error) {
    // Re-throw console authentication errors, but catch other errors
    if (error instanceof Error && error.message?.includes("Console session")) {
      throw error;
    }
    return { rpm: -1, tpm: -1 };
  }
}

interface CheckRow {
  model: string;
  rpmUsage: number;
  rpmLimit: number;
  tpmUsage: number;
  tpmLimit: number;
  rpmQuotaLeft: number | null;
  tpmQuotaLeft: number | null;
  rpmQuotaLabel: string | null;
  tpmQuotaLabel: string | null;
}

function printTable(rows: CheckRow[]): void {
  const color = ansi(process.stdout);
  const headers = ["Model", "RPM Used/Limit", "TPM Used/Limit", "Status", "RPM Left", "TPM Left"];

  const rpmPercents = rows.map((r) => r.rpmQuotaLeft);
  const rpmLabels = rows.map((r) => r.rpmQuotaLabel);
  const tpmPercents = rows.map((r) => r.tpmQuotaLeft);
  const tpmLabels = rows.map((r) => r.tpmQuotaLabel);

  const tableRows = rows.map((r) => {
    const rpmStr = r.rpmUsage < 0 ? "-" : `${r.rpmUsage}/${r.rpmLimit}`;
    const tpmStr = r.tpmUsage < 0 ? "-" : `${r.tpmUsage}/${r.tpmLimit}`;
    const maxPct = Math.max(
      r.rpmLimit > 0 ? (r.rpmUsage / r.rpmLimit) * 100 : 0,
      r.tpmLimit > 0 ? (r.tpmUsage / r.tpmLimit) * 100 : 0,
    );
    const status =
      r.rpmUsage < 0
        ? "-"
        : maxPct >= 100
          ? "Rate Limited"
          : maxPct >= 80
            ? "Near limit"
            : "Normal";
    return [r.model, rpmStr, tpmStr, status, "", ""];
  });

  const lines = renderBoxTable({
    headers,
    rows: tableRows,
    align: ["left", "right", "right", "left", "left", "left"],
    barColumns: [
      { index: 4, percents: rpmPercents, labels: rpmLabels, width: 15 },
      { index: 5, percents: tpmPercents, labels: tpmLabels, width: 15 },
    ],
    cellColor: (rowIndex, colIndex, value) => {
      if (colIndex === 3) {
        // Status 列着色
        if (value === "Rate Limited") return color.red(value);
        if (value === "Near limit") return color.yellow(value);
        if (value === "Normal") return color.green(value);
      }
      return undefined;
    },
  });

  for (const line of lines) process.stdout.write(line + "\n");
}

export default defineCommand({
  description: "Check current usage against rate limits",
  auth: "console",
  usageArgs: "[--model <model>] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model name(s), comma-separated",
    },
    period: {
      type: "string",
      valueHint: "<minutes>",
      description: "Query usage for the last N minutes (default: 2)",
    },
  },
  exampleArgs: [
    "",
    "--model qwen3.6-plus",
    "--period 5",
    "--model qwen3.6-plus,qwen-turbo",
    "--output json",
  ],
  validate: (f) =>
    (Number(f.period) || 2) < 1 ? "--period must be at least 1 minute." : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const windowMinutes = Number(flags.period) || 2;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          apis: [MODEL_LIST_API, MONITOR_API],
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    let models = await fetchAllModelsWithQpm(ctx.client);

    if (modelFlag) {
      const names = new Set(
        modelFlag
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
      );
      models = models.filter((m) => names.has(m.model));
    }

    models = models.filter((m) => m.qpmInfo);

    if (models.length === 0) {
      process.stdout.write("No models found.\n");
      return;
    }

    const monitorResults = await Promise.all(
      models.map((m) => fetchMonitorData(ctx.client, m.model, windowMinutes)),
    );

    const checkRows: CheckRow[] = models.map((m, idx) => {
      const qpm = m.qpmInfo!;
      const modelDefault = qpm["model-default"];
      const userSpec = qpm["user-spec"];

      const rpmLimit =
        calculateRPM(userSpec, modelDefault?.count_limit_period) || calculateRPM(modelDefault);
      const tpmLimit =
        calculateTPM(userSpec, modelDefault?.usage_limit_period) || calculateTPM(modelDefault);

      const rpmUsage = monitorResults[idx].rpm;
      const tpmUsage = monitorResults[idx].tpm;

      // RPM Quota Left = 1 - (rpmUsage / rpmLimit) in percentage
      let rpmQuotaPercent: number | null = null;
      let rpmQuotaLabel: string | null = null;
      if (rpmUsage >= 0 && rpmLimit > 0) {
        rpmQuotaPercent = Math.max(0, 100 - (rpmUsage / rpmLimit) * 100);
        rpmQuotaLabel = rpmQuotaPercent.toFixed(1) + "%";
      }

      // TPM Quota Left = 1 - (tpmUsage / tpmLimit) in percentage
      let tpmQuotaPercent: number | null = null;
      let tpmQuotaLabel: string | null = null;
      if (tpmUsage >= 0 && tpmLimit > 0) {
        tpmQuotaPercent = Math.max(0, 100 - (tpmUsage / tpmLimit) * 100);
        tpmQuotaLabel = tpmQuotaPercent.toFixed(1) + "%";
      }

      return {
        model: m.model,
        rpmUsage,
        rpmLimit,
        tpmUsage,
        tpmLimit,
        rpmQuotaLeft: rpmQuotaPercent,
        tpmQuotaLeft: tpmQuotaPercent,
        rpmQuotaLabel,
        tpmQuotaLabel,
      };
    });

    if (format === "json") {
      emitResult(checkRows, format);
      return;
    }

    printTable(checkRows);
  },
});
