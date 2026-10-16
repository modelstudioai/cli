import { randomUUID } from "node:crypto";
import { defineCommand, detectOutputFormat, unwrapResponse } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { printQuotaBox, readNumber, type QuotaSection } from "../usage/quota-box.ts";
import { formatNumber } from "../shared/format.ts";
import type { HarnessBenefitItem, TokenPlanEquityInfo } from "./types.ts";

const HARNESS_LIST_API = "zeldaEasy.broadscope-bailian.token-plan.detail";
const EQUITY_INFO_API = "zeldaEasy.bailian-commerce.tokenPlan.queryTokenPlanEquityInfo";

/** One harness that carries an entitlement quota, issued or still pending. */
interface HarnessQuotaRow {
  planCode: string;
  title: string;
  type: string;
  /** `issuing` means the harness carries a quota but no entitlement is issued yet. */
  status: "issued" | "issuing";
  quotaUnit: string;
  instanceId?: string;
  totalQuota?: number;
  availableQuota?: number;
  usedQuota?: number;
  /** Used ratio in percent with 0.1 precision, matching the console display. */
  usedPercent?: number;
  instanceStartTime?: number;
  instanceEndTime?: number;
}

function readArray<T>(result: unknown, field: string): T[] {
  const response = unwrapResponse(result as Record<string, unknown>);
  const value = response[field];
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Join the harness list with the issued entitlements, keeping the server order.
 * A harness carrying a resource pack but no matching entitlement is still
 * listed as `issuing` — issuance lags the purchase by a few minutes.
 */
function buildRows(
  items: HarnessBenefitItem[],
  equityInfos: TokenPlanEquityInfo[],
): HarnessQuotaRow[] {
  const rows: HarnessQuotaRow[] = [];

  for (const item of items) {
    // Only harnesses that carry a resource pack have an entitlement quota at all.
    if (item.hasResourcePack !== true) continue;

    const planCodes = item.planCodes ?? [];
    const equity = equityInfos.find(
      (equityInfo) => equityInfo.equityType && planCodes.includes(equityInfo.equityType),
    );
    const planCode = equity?.equityType ?? planCodes[0] ?? "";
    const row: HarnessQuotaRow = {
      planCode,
      title: item.title ?? planCode,
      type: item.type ?? "",
      status: equity ? "issued" : "issuing",
      quotaUnit: item.quotaUnit ?? item.priceInfo?.unit ?? "",
    };

    if (!equity) {
      rows.push(row);
      continue;
    }

    if (equity.instanceId) row.instanceId = equity.instanceId;
    const totalQuota = readNumber(equity.totalQuota);
    if (totalQuota !== undefined) row.totalQuota = totalQuota;
    const availableQuota = readNumber(equity.availableQuota);
    if (availableQuota !== undefined) row.availableQuota = availableQuota;
    if (totalQuota !== undefined && availableQuota !== undefined) {
      row.usedQuota = Math.max(totalQuota - availableQuota, 0);
      if (totalQuota > 0) {
        row.usedPercent = Math.round((row.usedQuota / totalQuota) * 1000) / 10;
      }
    }
    const instanceStartTime = readNumber(equity.instanceStartTime);
    if (instanceStartTime !== undefined) row.instanceStartTime = instanceStartTime;
    const instanceEndTime = readNumber(equity.instanceEndTime);
    if (instanceEndTime !== undefined) row.instanceEndTime = instanceEndTime;

    rows.push(row);
  }

  return rows;
}

function toSection(row: HarnessQuotaRow): QuotaSection {
  const section: QuotaSection = {
    label: `${row.title} (${row.planCode})`,
    emptyMessage:
      row.status === "issuing"
        ? "Quota is being issued; issuance can take up to 5 minutes."
        : "No positive quota total reported; check the Bailian Token Plan console.",
  };
  if (row.status === "issuing") return section;

  if (row.totalQuota !== undefined && row.usedQuota !== undefined) {
    const unitSuffix = row.quotaUnit ? ` ${row.quotaUnit}` : "";
    section.detail = `Used: ${formatNumber(row.usedQuota)} / ${formatNumber(row.totalQuota)}${unitSuffix}`;
    if (row.totalQuota > 0) section.percentage = row.usedQuota / row.totalQuota;
  }
  if (row.instanceEndTime !== undefined) section.resetTime = row.instanceEndTime;

  return section;
}

export default defineCommand({
  description: {
    "en-US": "Show Token Plan harness entitlement quota usage",
    "zh-CN": "查看 Token Plan harness 权益额度用量",
  },
  auth: "console",
  usageArgs: "[flags]",
  flags: {
    type: {
      type: "string",
      valueHint: "<type>",
      choices: ["official_tool", "infrastructure"] as const,
      description: {
        "en-US": "Filter harness list by type: official_tool, infrastructure",
        "zh-CN": "按类型筛选 harness 列表：official_tool、infrastructure",
      },
    },
  },
  exampleArgs: ["", "--type official_tool", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const benefitsData = flags.type ? { type: flags.type } : {};
    const equityData = { queryTokenPlanEquityInfoRequest: { requestId: randomUUID() } };

    if (settings.dryRun) {
      emitResult(
        {
          requests: [
            { api: HARNESS_LIST_API, data: benefitsData },
            { api: EQUITY_INFO_API, data: equityData },
          ],
        },
        format,
      );
      return;
    }

    const [benefitsResult, equityResult] = await Promise.all([
      ctx.client.console(HARNESS_LIST_API, benefitsData),
      ctx.client.console(EQUITY_INFO_API, equityData),
    ]);
    const rows = buildRows(
      readArray<HarnessBenefitItem>(benefitsResult, "items"),
      readArray<TokenPlanEquityInfo>(equityResult, "tokenPlanEquityInfos"),
    );

    if (format === "json") {
      emitResult({ generatedAt: Date.now(), items: rows }, format);
      return;
    }

    if (rows.length === 0) {
      process.stdout.write("No harness with entitlement quota found.\n");
      return;
    }

    printQuotaBox("Token Plan Harness Quota", rows.map(toSection), Date.now());
  },
});
