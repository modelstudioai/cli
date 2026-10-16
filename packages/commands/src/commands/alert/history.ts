import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult, renderBoxTable } from "bailian-cli-runtime";
import { formatDateTime } from "../shared/format.ts";
import { TELEMETRY_TIME_FLAGS, resolveTimeRange } from "../shared/telemetry.ts";
import { ALERT_LEVELS, ensureAlertReady, extractAlertPage } from "./shared.ts";

const LIST_HISTORIES_API = "zeldaEasy.bailian-telemetry.alertRule.listAlertHistories";

interface AlertHistoryItem {
  alertHistoryId: string;
  alertRuleId: string;
  ruleDisplayName: string;
  status: string;
  maxLevel: string;
  latestLevel?: string;
  count: number;
  message: string;
  startTime: number;
  endTime?: number;
  instanceDetail?: Record<string, string>;
}

function instanceText(item: AlertHistoryItem): string {
  const detail = item.instanceDetail;
  if (!detail) return "-";
  return (
    Object.entries(detail)
      .map(([key, value]) => `${key}:${value}`)
      .join(",") || "-"
  );
}

export default defineCommand({
  description: {
    "en-US": "List model alert history (firing and recovered events)",
    "zh-CN": "查看模型告警历史（告警中与已恢复事件）",
  },
  auth: "console",
  usageArgs: "[--rule-id <id>] [--status <status>] [flags]",
  flags: {
    ...TELEMETRY_TIME_FLAGS,
    ruleId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Filter by alert rule ID",
        "zh-CN": "按告警规则 ID 过滤",
      },
    },
    status: {
      type: "string",
      valueHint: "<status>",
      choices: ["ALARM", "OK"] as const,
      description: {
        "en-US": "Alert state: ALARM (firing), OK (recovered)",
        "zh-CN": "告警状态：ALARM（告警中）、OK（已恢复）",
      },
    },
    level: {
      type: "string",
      valueHint: "<level>",
      choices: ALERT_LEVELS,
      description: {
        "en-US": "Filter by highest alert level",
        "zh-CN": "按最高告警等级过滤",
      },
    },
    maxResults: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows per page, 1-50 (default: 10)",
        "zh-CN": "每页数量，范围 1-50（默认：10）",
      },
    },
    skip: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows to skip (default: 0)",
        "zh-CN": "跳过的记录数（默认：0）",
      },
    },
    nextToken: {
      type: "string",
      valueHint: "<token>",
      description: {
        "en-US": "Pagination token from a previous response",
        "zh-CN": "上一次响应返回的分页标记",
      },
    },
  },
  exampleArgs: [
    "",
    "--status ALARM --days 1",
    "--rule-id 789 --days 30",
    "--level ERROR --output json",
  ],
  validate: (flags) => {
    if (flags.maxResults != null && (flags.maxResults < 1 || flags.maxResults > 50)) {
      return "--max-results must be between 1 and 50.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";
    const { startTime, endTime } = resolveTimeRange(flags);

    const reqDTO = {
      workspaceId: settings.workspaceId,
      bizSource: "bailian",
      resourceType: "model",
      alertRuleId: flags.ruleId,
      status: flags.status,
      maxLevel: flags.level,
      startTimeFrom: startTime,
      startTimeTo: endTime,
      maxResults: flags.maxResults ?? 10,
      skip: flags.skip ?? 0,
      nextToken: flags.nextToken,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_HISTORIES_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    const raw = await ctx.client.console(LIST_HISTORIES_API, { reqDTO });
    const page = extractAlertPage<AlertHistoryItem>(raw);

    if (format === "json") {
      emitResult(page, format);
      return;
    }

    if (page.list.length === 0) {
      process.stdout.write("No alert history found in this range.\n");
      return;
    }

    const color = ansi(process.stdout);
    const lines = renderBoxTable({
      headers: ["Start Time", "Rule", "Status", "Max Level", "Count", "Instance"],
      rows: page.list.map((item) => [
        item.startTime ? formatDateTime(item.startTime) : "-",
        item.ruleDisplayName ?? item.alertRuleId,
        item.status ?? "-",
        item.maxLevel ?? "-",
        String(item.count ?? 0),
        instanceText(item),
      ]),
      align: ["left", "left", "left", "left", "right", "left"],
      cellColor: (_rowIndex, colIndex, value) => {
        if (colIndex === 2) return value === "ALARM" ? color.red(value) : color.green(value);
        if (colIndex === 3 && value === "ERROR") return color.red(value);
        return undefined;
      },
    });
    for (const line of lines) process.stdout.write(line + "\n");

    if (page.nextToken) {
      process.stdout.write(`Next page: --next-token ${page.nextToken}\n`);
    }
  },
});
