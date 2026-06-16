import {
  defineCommand,
  callConsoleGateway,
  resolveConsoleGatewayCredential,
  detectOutputFormat,
  BailianError,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { emitResult } from "../../output/output.ts";
import { displayWidth, padEnd } from "../../output/cjk-width.ts";

const HISTORY_API = "zeldaEasy.broadscope-platform.modelInstance.listModelLimitApplications";

interface LimitApplicationItem {
  gmtCreate: string;
  deployedModel: string;
  usageLimit: number;
  endTime?: string;
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

function formatDateTime(ts: string | undefined): string {
  if (!ts) return "-";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${d} ${h}:${mi}`;
  } catch {
    return ts;
  }
}

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function printTable(records: LimitApplicationItem[], noColor: boolean, total: number): void {
  const bold = noColor ? (t: string) => t : (t: string) => `\x1b[1m${t}\x1b[0m`;
  const dim = noColor ? (t: string) => t : (t: string) => `\x1b[2m${t}\x1b[0m`;

  const headersCn = ["模型", "Token 账号限流", "申请时间"];
  const headersEn = ["Model", "Token Limit", "Applied At"];

  const rows = records.map((r) => [
    r.deployedModel,
    formatNumber(r.usageLimit),
    formatDateTime(r.gmtCreate),
  ]);

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

  process.stdout.write(dim(`\n共 ${total} 条记录 (Total: ${total})`) + "\n");
}

export default defineCommand({
  name: "quota history",
  description: "View quota change history",
  usage: "bl quota history [flags]",
  options: [
    {
      flag: "--page <n>",
      description: "Page number (default: 1)",
    },
    {
      flag: "--page-size <n>",
      description: "Page size (default: 10)",
    },
    {
      flag: "--model <model>",
      description: "Filter by model name",
    },
    { flag: "--console-region <region>", description: "Console region (global flag)" },
    {
      flag: "--console-site <site>",
      description: "Console site: domestic, international (global flag)",
    },
    {
      flag: "--console-switch-agent <uid>",
      description: "Switch agent UID (global flag)",
      type: "number",
    },
  ],
  examples: [
    "bl quota history",
    "bl quota history --page 2",
    "bl quota history --page-size 20",
    "bl quota history --model qwen-turbo",
    "bl quota history --output json",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const page = Number(flags.page) || 1;
    const pageSize = Number(flags.pageSize) || 10;
    const modelFilter = (flags.model as string) || undefined;
    const format = detectOutputFormat(config.output);

    const credential = await resolveConsoleGatewayCredential(config);

    const requestData = {
      input: { pageNo: page, pageSize },
    };

    if (config.dryRun) {
      emitResult({ api: HISTORY_API, data: requestData }, format);
      return;
    }

    let result: unknown;
    try {
      result = await callConsoleGateway(config, credential.token, {
        api: HISTORY_API,
        data: requestData,
      });
    } catch (err) {
      if (err instanceof BailianError && err.message.includes("NotLogined")) {
        process.stderr.write(
          "Error: session expired. Run `bl auth login --console` to re-authenticate.\n",
        );
        process.exit(1);
      }
      throw err;
    }

    if (format === "json") {
      emitResult(result, format);
      return;
    }

    const resp = extractResponseData(result as Record<string, unknown>);
    let records = (resp.records as LimitApplicationItem[]) ?? [];
    const total = (resp.items as number) ?? records.length;

    if (modelFilter) {
      records = records.filter((r) => r.deployedModel === modelFilter);
    }

    if (records.length === 0) {
      process.stdout.write("No quota change history found.\n");
      return;
    }

    printTable(records, config.noColor, modelFilter ? records.length : total);
  },
});
