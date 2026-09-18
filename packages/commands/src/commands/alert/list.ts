import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { ansi, emitResult, renderBoxTable } from "bailian-cli-runtime";
import { ensureAlertReady, extractAlertPage, ALERT_LEVELS } from "./shared.ts";

const LIST_RULES_API = "zeldaEasy.bailian-telemetry.alertRule.listAlertRules";

interface AlertRuleItem {
  ruleId: string;
  name: string;
  level: string;
  enabled: boolean;
  resourceIds: string[];
  interval: number;
  duration: number;
  gmtModified?: number;
}

function printTable(list: AlertRuleItem[]): void {
  const color = ansi(process.stdout);

  if (list.length === 0) {
    process.stdout.write("No alert rules found.\n");
    return;
  }

  const lines = renderBoxTable({
    headers: ["Rule ID", "Name", "Level", "Enabled", "Models", "Interval"],
    rows: list.map((rule) => [
      rule.ruleId,
      rule.name,
      rule.level ?? "-",
      rule.enabled ? "ON" : "OFF",
      (rule.resourceIds ?? []).join(", ") || "-",
      rule.interval != null ? `${rule.interval}s` : "-",
    ]),
    align: ["left", "left", "left", "left", "left", "right"],
    cellColor: (_rowIndex, colIndex, value) => {
      if (colIndex === 3) return value === "ON" ? color.green(value) : color.yellow(value);
      if (colIndex === 2 && value === "ERROR") return color.red(value);
      return undefined;
    },
  });
  for (const line of lines) process.stdout.write(line + "\n");
}

export default defineCommand({
  description: {
    "en-US": "List model alert rules",
    "zh-CN": "查看模型告警规则列表",
  },
  auth: "console",
  usageArgs: "[--name <name>] [--enabled true|false] [flags]",
  flags: {
    ruleId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Exact rule ID filter",
        "zh-CN": "按规则 ID 精确过滤",
      },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Fuzzy filter by rule name",
        "zh-CN": "按规则名称模糊过滤",
      },
    },
    enabled: {
      type: "boolean",
      valueHint: "<true|false>",
      description: {
        "en-US": "Filter by enabled state",
        "zh-CN": "按启用状态过滤",
      },
    },
    level: {
      type: "string",
      valueHint: "<level>",
      choices: ALERT_LEVELS,
      description: {
        "en-US": "Filter by alert level",
        "zh-CN": "按告警等级过滤",
      },
    },
    maxResults: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows per page (default: 20)",
        "zh-CN": "每页数量（默认：20）",
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
  exampleArgs: ["", "--enabled true", "--name 失败率 --level ERROR", "--output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = {
      workspaceId: settings.workspaceId,
      bizSource: "bailian",
      resourceType: "model",
      ruleId: flags.ruleId,
      name: flags.name,
      enabled: flags.enabled,
      level: flags.level,
      maxResults: flags.maxResults ?? 20,
      skip: flags.skip ?? 0,
      nextToken: flags.nextToken,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_RULES_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    const raw = await ctx.client.console(LIST_RULES_API, { reqDTO });
    const page = extractAlertPage<AlertRuleItem>(raw);

    if (format === "json") {
      emitResult(page, format);
      return;
    }

    printTable(page.list);
    if (page.nextToken) {
      process.stdout.write(`Next page: --next-token ${page.nextToken}\n`);
    }
  },
});
