import {
  defineCommand,
  BailianError,
  ExitCode,
  detectOutputFormat,
  unwrapResponse,
  MODEL_LIST_API,
  type Client,
} from "bailian-cli-core";
import { emitResult, renderBoxTable } from "bailian-cli-runtime";

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

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
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

    const resp = unwrapResponse(raw as Record<string, unknown>);
    const metrics = (resp.data ?? resp) as MonitorMetric[] | Record<string, unknown>;
    if (!Array.isArray(metrics)) {
      return { rpm: 0, tpm: 0 };
    }

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
    // Re-throw authentication errors (BailianError with ExitCode.AUTH);
    // other errors are treated as "no data" and show "-" in the table.
    if (error instanceof BailianError && error.exitCode === ExitCode.AUTH) {
      throw error;
    }
    return { rpm: -1, tpm: -1 };
  }
}

async function fetchAllModelsWithQpm(client: Client): Promise<ModelWithQpm[]> {
  const allModels: ModelWithQpm[] = [];
  let pageNo = 1;

  while (true) {
    const input: Record<string, unknown> = {
      pageNo,
      pageSize: 50,
      group: false,
      queryQpmInfo: true,
      ignoreWorkspaceServiceSite: true,
      supports: { selfServiceLimitIncrease: true },
    };

    const raw = await client.console(MODEL_LIST_API, { input });

    const resp = unwrapResponse(raw as Record<string, unknown>);
    const list = (resp.list as ModelWithQpm[]) ?? [];
    const total = (resp.total as number) ?? 0;

    allModels.push(...list);
    if (allModels.length >= total || list.length === 0) break;
    pageNo++;
  }

  return allModels;
}

interface ListRow {
  model: string;
  rpm: string;
  tpm: string;
  rpmQuotaLeft: number | null;
  tpmQuotaLeft: number | null;
  rpmQuotaLabel: string | null;
  tpmQuotaLabel: string | null;
}

function printTable(rows: ListRow[]): void {
  const headers = ["Model", "Req/min", "Token/min", "RPM Left", "TPM Left"];

  const rpmPercents = rows.map((r) => r.rpmQuotaLeft);
  const rpmLabels = rows.map((r) => r.rpmQuotaLabel);
  const tpmPercents = rows.map((r) => r.tpmQuotaLeft);
  const tpmLabels = rows.map((r) => r.tpmQuotaLabel);

  const tableRows = rows.map((r) => [r.model, r.rpm, r.tpm, "", ""]);

  const lines = renderBoxTable({
    headers,
    rows: tableRows,
    align: ["left", "right", "right", "left", "left"],
    barColumns: [
      { index: 3, percents: rpmPercents, labels: rpmLabels, width: 15 },
      { index: 4, percents: tpmPercents, labels: tpmLabels, width: 15 },
    ],
  });

  for (const line of lines) process.stdout.write(line + "\n");
}

export default defineCommand({
  description: { "en-US": "View model RPM/TPM rate limits", "zh-CN": "查看模型 RPM/TPM 限流额度" },
  auth: "console",
  usageArgs: "[--model <model>] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model name(s), comma-separated",
        "zh-CN": "模型名称，多个名称以逗号分隔",
      },
    },
  },
  exampleArgs: ["", "--model qwen3.6-plus", "--model qwen3.6-plus,qwen-turbo", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const modelFlag = flags.model || undefined;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      const input: Record<string, unknown> = {
        pageNo: 1,
        pageSize: 50,
        group: false,
        queryQpmInfo: true,
        ignoreWorkspaceServiceSite: true,
        supports: { selfServiceLimitIncrease: true },
      };
      emitResult(
        {
          apis: [
            MODEL_LIST_API,
            { api: MONITOR_API, note: "called per-model for text output with gauges" },
          ],
          modelListInput: { input },
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
      if (models.length === 0) {
        throw new BailianError(`no matching models found for "${modelFlag}".`);
      }
    }

    if (format === "json") {
      const items = models.map((m) => {
        const qpm = m.qpmInfo;
        const modelDefault = qpm?.["model-default"];
        const userSpec = qpm?.["user-spec"];

        const defaultRPM = calculateRPM(modelDefault);
        const defaultTPM = calculateTPM(modelDefault);
        const currentRPM = calculateRPM(userSpec, modelDefault?.count_limit_period) || defaultRPM;
        const currentTPM = calculateTPM(userSpec, modelDefault?.usage_limit_period) || defaultTPM;

        return {
          model: m.model,
          rpm: currentRPM > 0 ? currentRPM : null,
          tpm: currentTPM > 0 ? currentTPM : null,
        };
      });
      emitResult(items, format);
      return;
    }

    // For text output with gauges, we need monitor data
    const monitorResults = await Promise.all(
      models.map((m) => fetchMonitorData(ctx.client, m.model, 2)),
    );

    const rows: ListRow[] = models.map((m, idx) => {
      const qpm = m.qpmInfo;
      const modelDefault = qpm?.["model-default"];
      const userSpec = qpm?.["user-spec"];

      const defaultRPM = calculateRPM(modelDefault);
      const defaultTPM = calculateTPM(modelDefault);
      const currentRPM = calculateRPM(userSpec, modelDefault?.count_limit_period) || defaultRPM;
      const currentTPM = calculateTPM(userSpec, modelDefault?.usage_limit_period) || defaultTPM;

      const rpmUsage = monitorResults[idx].rpm;
      const tpmUsage = monitorResults[idx].tpm;

      // RPM Quota Left = 1 - (rpmUsage / currentRPM) in percentage
      let rpmQuotaPercent: number | null = null;
      let rpmQuotaLabel: string | null = null;
      if (rpmUsage >= 0 && currentRPM > 0) {
        rpmQuotaPercent = Math.max(0, 100 - (rpmUsage / currentRPM) * 100);
        rpmQuotaLabel = rpmQuotaPercent.toFixed(1) + "%";
      }

      // TPM Quota Left = 1 - (tpmUsage / currentTPM) in percentage
      let tpmQuotaPercent: number | null = null;
      let tpmQuotaLabel: string | null = null;
      if (tpmUsage >= 0 && currentTPM > 0) {
        tpmQuotaPercent = Math.max(0, 100 - (tpmUsage / currentTPM) * 100);
        tpmQuotaLabel = tpmQuotaPercent.toFixed(1) + "%";
      }

      return {
        model: m.model,
        rpm: currentRPM > 0 ? formatNumber(currentRPM) : "-",
        tpm: currentTPM > 0 ? formatNumber(currentTPM) : "-",
        rpmQuotaLeft: rpmQuotaPercent,
        tpmQuotaLeft: tpmQuotaPercent,
        rpmQuotaLabel,
        tpmQuotaLabel,
      };
    });

    if (rows.length === 0) {
      process.stdout.write("No models found.\n");
      return;
    }

    printTable(rows);
  },
});
