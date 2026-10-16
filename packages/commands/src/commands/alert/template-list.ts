import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult, renderBoxTable } from "bailian-cli-runtime";
import { ensureAlertReady, extractAlertPage } from "./shared.ts";

const LIST_TEMPLATES_API = "zeldaEasy.bailian-telemetry.alertTemplate.listAlertTemplates";

interface AlertCondition {
  alertMetric?: string;
  metricName?: string;
  aggregator?: string;
  compareType: string;
  compareValue: string;
  period: number;
}

interface AlertTemplate {
  templateId: string;
  templateName: string;
  source: string;
  logicalOperator?: string;
  conditions?: AlertCondition[];
  gmtModified?: number;
}

function formatCondition(condition: AlertCondition): string {
  const metric = condition.metricName ?? condition.alertMetric ?? "?";
  const agg = condition.aggregator ? `${condition.aggregator} ` : "";
  return `${agg}${metric} ${condition.compareType} ${condition.compareValue} (${condition.period}s)`;
}

export default defineCommand({
  description: {
    "en-US": "List alert templates (official and custom); pass --template-id for details",
    "zh-CN": "查看告警模板（官方与自定义）；传 --template-id 查看单个模板详情",
  },
  auth: "console",
  usageArgs: "[--name <name>] [--source <source>] [flags]",
  flags: {
    templateId: {
      type: "string",
      valueHint: "<id>",
      description: {
        "en-US": "Exact template ID (view a single template)",
        "zh-CN": "精确模板 ID（查看单个模板）",
      },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Fuzzy filter by template name",
        "zh-CN": "按模板名称模糊过滤",
      },
    },
    source: {
      type: "string",
      valueHint: "<source>",
      choices: ["Official", "Customize"] as const,
      description: {
        "en-US": "Template source: Official, Customize; omit for all",
        "zh-CN": "模板来源：Official、Customize；省略表示全部",
      },
    },
    maxResults: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Rows per page (default: 50)",
        "zh-CN": "每页数量（默认：50）",
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
  },
  exampleArgs: ["", "--source Official", "--name 失败率", "--template-id 123 --output json"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = {
      resourceType: "model",
      templateId: flags.templateId,
      templateName: flags.name,
      source: flags.source,
      maxResults: flags.maxResults ?? 50,
      skip: flags.skip ?? 0,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_TEMPLATES_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    const raw = await ctx.client.console(LIST_TEMPLATES_API, { reqDTO });
    const page = extractAlertPage<AlertTemplate>(raw);

    if (format === "json") {
      emitResult(page, format);
      return;
    }

    if (page.list.length === 0) {
      process.stdout.write("No alert templates found.\n");
      return;
    }

    const lines = renderBoxTable({
      headers: ["Template ID", "Name", "Source", "Conditions"],
      rows: page.list.map((template) => [
        template.templateId,
        template.templateName,
        template.source === "Official" ? "Official" : "Custom",
        (template.conditions ?? [])
          .map(formatCondition)
          .join(template.logicalOperator === "and" ? " AND " : " OR ") || "-",
      ]),
      align: ["left", "left", "left", "left"],
    });
    for (const line of lines) process.stdout.write(line + "\n");
  },
});
