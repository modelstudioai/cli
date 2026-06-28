import { defineCommand, detectOutputFormat, BailianError } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";

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

  const headers = ["Model", "Token Limit", "Applied At"];

  const rows = records.map((r) => [
    r.deployedModel,
    formatNumber(r.usageLimit),
    formatDateTime(r.gmtCreate),
  ]);

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const headerLine = headers.map((label, col) => bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((w) => dim("─".repeat(w))).join("──");

  process.stdout.write(headerLine + "\n");
  process.stdout.write(separator + "\n");

  for (const row of rows) {
    process.stdout.write(row.map((cell, col) => padEnd(cell, widths[col])).join("  ") + "\n");
  }

  process.stdout.write(dim(`\nTotal: ${total} records`) + "\n");
}

export default defineCommand({
  description: "View quota change history",
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    page: {
      type: "string",
      valueHint: "<n>",
      description: "Page number (default: 1)",
    },
    pageSize: {
      type: "string",
      valueHint: "<n>",
      description: "Page size (default: 10)",
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Filter by model name",
    },
    consoleRegion: { type: "string", valueHint: "<region>", description: "Console region" },
    consoleSite: {
      type: "string",
      valueHint: "<site>",
      description: "Console site: domestic, international",
    },
    consoleSwitchAgent: { type: "number", valueHint: "<uid>", description: "Switch agent UID" },
  },
  exampleArgs: ["", "--page 2", "--page-size 20", "--model qwen-turbo", "--output json"],
  async run(ctx) {
    const { config, flags } = ctx;
    const page = Number(flags.page) || 1;
    const pageSize = Number(flags.pageSize) || 10;
    const modelFilter = flags.model || undefined;
    const format = detectOutputFormat(config.output);

    const requestData = {
      input: { pageNo: page, pageSize },
    };

    if (config.dryRun) {
      emitResult({ api: HISTORY_API, data: requestData }, format);
      return;
    }

    let result: unknown;
    try {
      result = await ctx.client.console(HISTORY_API, requestData);
    } catch (err) {
      if (err instanceof BailianError && err.message.includes("NotLogined")) {
        process.stderr.write(
          `Error: session expired. Run \`${config.binName} auth login --console\` to re-authenticate.\n`,
        );
        process.exit(1);
      }
      throw err;
    }

    const resp = extractResponseData(result as Record<string, unknown>);
    let records = (resp.records as LimitApplicationItem[]) ?? [];
    const total = (resp.items as number) ?? records.length;

    if (modelFilter) {
      records = records.filter((r) => r.deployedModel === modelFilter);
    }

    if (format === "json") {
      const items = records.map((r) => ({
        model: r.deployedModel,
        tokenLimit: r.usageLimit,
        appliedAt: formatDateTime(r.gmtCreate),
      }));
      emitResult({ records: items, total: modelFilter ? records.length : total }, format);
      return;
    }

    if (records.length === 0) {
      process.stdout.write("No quota change history found.\n");
      return;
    }

    printTable(records, config.noColor, modelFilter ? records.length : total);
  },
});
