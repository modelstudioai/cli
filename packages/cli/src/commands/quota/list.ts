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
  onlySelfService: boolean,
): Promise<ModelWithQpm[]> {
  const allModels: ModelWithQpm[] = [];
  let pageNo = 1;

  while (true) {
    const input: Record<string, unknown> = {
      pageNo,
      pageSize: 50,
      group: false,
      queryQpmInfo: true,
      ignoreWorkspaceServiceSite: true,
    };
    if (onlySelfService) {
      input.supports = { selfServiceLimitIncrease: true };
    }

    const raw = await callConsoleGateway(config, token, {
      api: MODEL_LIST_API,
      data: { input },
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

function printTable(models: ModelWithQpm[], noColor: boolean): void {
  const bold = noColor ? (t: string) => t : (t: string) => `\x1b[1m${t}\x1b[0m`;
  const dim = noColor ? (t: string) => t : (t: string) => `\x1b[2m${t}\x1b[0m`;

  const headersCn = ["模型", "RPM", "TPM", "可设上限 TPM"];
  const headersEn = ["Model", "Req/min", "Token/min", "Max TPM"];

  const rows = models.map((m) => {
    const qpm = m.qpmInfo;
    const modelDefault = qpm?.["model-default"];
    const userSpec = qpm?.["user-spec"];

    const defaultRPM = calculateRPM(modelDefault);
    const defaultTPM = calculateTPM(modelDefault);
    const currentRPM = calculateRPM(userSpec, modelDefault?.count_limit_period) || defaultRPM;
    const currentTPM = calculateTPM(userSpec, modelDefault?.usage_limit_period) || defaultTPM;
    const maxTPM = defaultTPM * 2;

    return [
      m.model,
      currentRPM > 0 ? formatNumber(currentRPM) : "-",
      currentTPM > 0 ? formatNumber(currentTPM) : "-",
      maxTPM > 0 ? formatNumber(maxTPM) : "-",
    ];
  });

  if (rows.length === 0) {
    process.stdout.write("No models found.\n");
    return;
  }

  const widths = headersCn.map((label, col) =>
    Math.max(
      displayWidth(label),
      displayWidth(headersEn[col]),
      ...rows.map((row) => displayWidth(row[col])),
    ),
  );

  const cnLine = headersCn.map((label, col) => bold(padEnd(label, widths[col]))).join("  ");
  const enLine = headersEn.map((label, col) => dim(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((w) => dim("─".repeat(w))).join("──");

  process.stdout.write(cnLine + "\n");
  process.stdout.write(enLine + "\n");
  process.stdout.write(separator + "\n");

  for (const row of rows) {
    process.stdout.write(row.map((cell, col) => padEnd(cell, widths[col])).join("  ") + "\n");
  }

  process.stdout.write(dim(`\n共 ${models.length} 个模型 (Total: ${models.length})`) + "\n");
}

export default defineCommand({
  name: "quota list",
  description: "View model RPM/TPM rate limits",
  usage: "bl quota list [--model <model>] [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model name(s), comma-separated",
    },
    {
      flag: "--all",
      description: "Show all models, not just self-service ones",
    },
  ],
  examples: [
    "bl quota list",
    "bl quota list --model qwen3.6-plus",
    "bl quota list --model qwen3.6-plus,qwen-turbo",
    "bl quota list --all",
    "bl quota list --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const modelFlag = (flags.model as string) || undefined;
    const showAll = Boolean(flags.all);
    const format = detectOutputFormat(config.output);

    const credential = await resolveConsoleGatewayCredential(config);

    if (config.dryRun) {
      const input: Record<string, unknown> = {
        pageNo: 1,
        pageSize: 50,
        group: false,
        queryQpmInfo: true,
        ignoreWorkspaceServiceSite: true,
      };
      if (!showAll) input.supports = { selfServiceLimitIncrease: true };
      emitResult({ api: MODEL_LIST_API, data: { input } }, format);
      return;
    }

    let models = await fetchAllModelsWithQpm(config, credential.token, !showAll);

    if (modelFlag) {
      const names = new Set(
        modelFlag
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
      );
      models = models.filter((m) => names.has(m.model));
      if (models.length === 0) {
        process.stderr.write(`Error: no matching models found for "${modelFlag}".\n`);
        process.exit(1);
      }
    }

    if (format === "json") {
      emitResult(models, format);
      return;
    }

    printTable(models, config.noColor);
  },
});
