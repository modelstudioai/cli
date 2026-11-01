import { defineCommand, BailianError, ExitCode } from "bailian-cli-core";
import { ansi } from "bailian-cli-runtime";
import { displayWidth, padEnd } from "bailian-cli-runtime";
import { formatNumber } from "../shared/format.ts";

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

function renderTable(records: LimitApplicationItem[], total: number): string {
  const color = ansi(process.stdout);

  const headers = ["Model", "Token Limit", "Applied At"];

  const rows = records.map((r) => [
    r.deployedModel,
    formatNumber(r.usageLimit),
    formatDateTime(r.gmtCreate),
  ]);

  const widths = headers.map((label, col) =>
    Math.max(displayWidth(label), ...rows.map((row) => displayWidth(row[col]))),
  );

  const headerLine = headers.map((label, col) => color.bold(padEnd(label, widths[col]))).join("  ");
  const separator = widths.map((w) => color.dim("─".repeat(w))).join("──");

  return [
    headerLine,
    separator,
    ...rows.map((row) => row.map((cell, col) => padEnd(cell, widths[col])).join("  ")),
    color.dim(`\nTotal: ${total} records`),
  ].join("\n");
}

export default defineCommand({
  description: { "en-US": "View quota change history", "zh-CN": "查看额度变更历史" },
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    page: {
      type: "string",
      valueHint: "<n>",
      description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
    },
    pageSize: {
      type: "string",
      valueHint: "<n>",
      description: { "en-US": "Page size (default: 10)", "zh-CN": "每页数量（默认：10）" },
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: { "en-US": "Filter by model name", "zh-CN": "按模型名称筛选" },
    },
  },
  exampleArgs: ["", "--page 2", "--page-size 20", "--model qwen-turbo", "--output json"],
  async run(ctx) {
    const { identity, settings, flags } = ctx;
    const page = Number(flags.page) || 1;
    const pageSize = Number(flags.pageSize) || 10;
    const modelFilter = flags.model || undefined;
    const format = settings.output;

    const requestData = {
      input: { pageNo: page, pageSize },
    };

    if (settings.dryRun) {
      ctx.output.result({ api: HISTORY_API, data: requestData });
      return;
    }

    let result: unknown;
    try {
      result = await ctx.client.console(HISTORY_API, requestData);
    } catch (err) {
      if (err instanceof BailianError && err.message.includes("NotLogined")) {
        throw new BailianError(
          "session expired.",
          ExitCode.AUTH,
          `Run \`${identity.binName} auth login --console\` to re-authenticate.`,
        );
      }
      throw err;
    }

    const resp = extractResponseData(result as Record<string, unknown>);
    let records = (resp.records as LimitApplicationItem[]) ?? [];
    const total = (resp.items as number) ?? records.length;

    if (modelFilter) {
      records = records.filter((r) => r.deployedModel === modelFilter);
    }

    const items = records.map((record) => ({
      model: record.deployedModel,
      tokenLimit: record.usageLimit,
      appliedAt: formatDateTime(record.gmtCreate),
    }));
    const resultTotal = modelFilter ? records.length : total;
    ctx.output.result(
      { records: items, total: resultTotal },
      format === "text"
        ? {
            text: records.length
              ? renderTable(records, resultTotal)
              : ctx.localize({
                  "en-US": "No quota change history found.",
                  "zh-CN": "未找到额度变更历史。",
                }),
          }
        : undefined,
    );
  },
});
