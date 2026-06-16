import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";
import { displayWidth, padEnd } from "../../output/cjk-width.ts";

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

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function formatRatio(usage: number, limit: number): string {
  if (limit <= 0) return "-";
  const pct = Math.round((usage / limit) * 100);
  return `${formatNumber(usage)}/${formatNumber(limit)} (${pct}%)`;
}

function getStatus(usage: number, limit: number): string {
  if (limit <= 0) return "-";
  const pct = (usage / limit) * 100;
  if (pct >= 100) return "Throttled";
  if (pct >= 80) return "Near Limit";
  return "Normal";
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

async function fetchAllModelsWithQpm(
  config: Config,
  token: string,
  region: string,
): Promise<ModelWithQpm[]> {
  const allModels: ModelWithQpm[] = [];
  let pageNo = 1;

  while (true) {
    const raw = await callConsoleGateway(config, token, {
      api: MODEL_LIST_API,
      data: {
        input: {
          pageNo,
          pageSize: 50,
          group: false,
          queryQpmInfo: true,
          ignoreWorkspaceServiceSite: true,
          supports: { selfServiceLimitIncrease: true },
        },
      },
      region,
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
  config: Config,
  token: string,
  region: string,
  modelName: string,
  windowMinutes: number,
): Promise<{ rpm: number; tpm: number }> {
  const now = Date.now();
  const startTime = now - windowMinutes * 60 * 1000;

  try {
    const raw = await callConsoleGateway(config, token, {
      api: MONITOR_API,
      data: {
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
      },
      region,
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
  } catch {
    return { rpm: -1, tpm: -1 };
  }
}

interface CheckRow {
  model: string;
  rpmUsage: number;
  rpmLimit: number;
  tpmUsage: number;
  tpmLimit: number;
}

function printTable(rows: CheckRow[], noColor: boolean): void {
  const bold = noColor ? (t: string) => t : (t: string) => `\x1b[1m${t}\x1b[0m`;
  const dim = noColor ? (t: string) => t : (t: string) => `\x1b[2m${t}\x1b[0m`;
  const green = noColor ? (t: string) => t : (t: string) => `\x1b[32m${t}\x1b[0m`;
  const yellow = noColor ? (t: string) => t : (t: string) => `\x1b[33m${t}\x1b[0m`;
  const red = noColor ? (t: string) => t : (t: string) => `\x1b[31m${t}\x1b[0m`;

  const headersEn = ["Model", "RPM Usage/Limit", "TPM Usage/Limit", "Status"];

  const tableRows = rows.map((r) => {
    const rpmStr = r.rpmUsage < 0 ? "-" : formatRatio(r.rpmUsage, r.rpmLimit);
    const tpmStr = r.tpmUsage < 0 ? "-" : formatRatio(r.tpmUsage, r.tpmLimit);
    const maxPct = Math.max(
      r.rpmLimit > 0 ? (r.rpmUsage / r.rpmLimit) * 100 : 0,
      r.tpmLimit > 0 ? (r.tpmUsage / r.tpmLimit) * 100 : 0,
    );
    const status =
      r.rpmUsage < 0
        ? "-"
        : getStatus(Math.max(r.rpmUsage, r.tpmUsage), Math.max(r.rpmLimit, r.tpmLimit));
    return { cells: [r.model, rpmStr, tpmStr, status], maxPct };
  });

  if (tableRows.length === 0) {
    process.stdout.write("No models found.\n");
    return;
  }

  const widths = headersEn.map((label, col) =>
    Math.max(displayWidth(label), ...tableRows.map((r) => displayWidth(r.cells[col]))),
  );

  const headerLine = headersEn.map((label, col) => bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((w) => dim("─".repeat(w))).join("──");

  process.stdout.write(headerLine + "\n");
  process.stdout.write(separator + "\n");

  const statusCol = 3;
  for (const r of tableRows) {
    const cells = r.cells.map((cell, col) => {
      if (col === statusCol) {
        if (cell === "Throttled") return red(padEnd(cell, widths[col]));
        if (cell === "Near Limit") return yellow(padEnd(cell, widths[col]));
        if (cell === "Normal") return green(padEnd(cell, widths[col]));
      }
      return padEnd(cell, widths[col]);
    });
    process.stdout.write(cells.join("  ") + "\n");
  }

  process.stdout.write(dim(`\nTotal: ${rows.length} models`) + "\n");
}

export default defineCommand({
  name: "quota check",
  description: "Check current usage against rate limits",
  usage: "bl quota check [--model <model>] [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model name(s), comma-separated",
    },
    {
      flag: "--period <minutes>",
      description: "Query usage for the last N minutes (default: 2)",
    },
    {
      flag: "--region <region>",
      description: "API region (default: cn-beijing)",
    },
  ],
  examples: [
    "bl quota check",
    "bl quota check --model qwen3.6-plus",
    "bl quota check --period 5",
    "bl quota check --model qwen3.6-plus,qwen-turbo",
    "bl quota check --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const modelFlag = (flags.model as string) || undefined;
    const rawPeriod = Number(flags.period) || 2;
    if (rawPeriod < 1) {
      process.stderr.write("Error: --period must be at least 1 minute.\n");
      process.exit(1);
    }
    const windowMinutes = rawPeriod;
    const region = (flags.region as string) || "cn-beijing";
    const format = detectOutputFormat(config.output);

    const credential = await resolveConsoleGatewayCredential(config);

    if (config.dryRun) {
      emitResult(
        {
          apis: [MODEL_LIST_API, MONITOR_API],
          region,
        },
        format,
      );
      return;
    }

    let models = await fetchAllModelsWithQpm(config, credential.token, region);

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
      models.map((m) => fetchMonitorData(config, credential.token, region, m.model, windowMinutes)),
    );

    const checkRows: CheckRow[] = models.map((m, idx) => {
      const qpm = m.qpmInfo!;
      const modelDefault = qpm["model-default"];
      const userSpec = qpm["user-spec"];

      const rpmLimit =
        calculateRPM(userSpec, modelDefault?.count_limit_period) || calculateRPM(modelDefault);
      const tpmLimit =
        calculateTPM(userSpec, modelDefault?.usage_limit_period) || calculateTPM(modelDefault);

      return {
        model: m.model,
        rpmUsage: monitorResults[idx].rpm,
        rpmLimit,
        tpmUsage: monitorResults[idx].tpm,
        tpmLimit,
      };
    });

    if (format === "json") {
      emitResult(checkRows, format);
      return;
    }

    printTable(checkRows, config.noColor);
  },
});
