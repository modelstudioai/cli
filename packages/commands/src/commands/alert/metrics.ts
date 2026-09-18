import {
  defineCommand,
  detectOutputFormat,
  effectiveConsoleGatewayConfig,
  unwrapResponse,
} from "bailian-cli-core";
import { emitResult, renderBoxTable } from "bailian-cli-runtime";
import { ensureAlertReady } from "./shared.ts";

const LIST_METRICS_API = "zeldaEasy.bailian-telemetry.alertMetric.listMetrics";

interface AlertMetric {
  metricName: string;
  aggregators: string[];
  desc: string;
  unit?: string;
  resourceType?: string;
}

export default defineCommand({
  description: {
    "en-US": "List metrics that alert rules can be created on, with supported aggregations",
    "zh-CN": "查看可创建告警的指标及其支持的聚合方式",
  },
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    if (settings.dryRun) {
      emitResult(
        {
          api: LIST_METRICS_API,
          data: { reqDTO: { workspaceId: settings.workspaceId, resourceType: "model" } },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    const raw = await ctx.client.console(LIST_METRICS_API, {
      reqDTO: { workspaceId: settings.workspaceId, resourceType: "model" },
    });
    const resp = unwrapResponse(raw as Record<string, unknown>);
    const list = (
      Array.isArray(resp) ? resp : (((resp.list ?? resp.result) as unknown[]) ?? [])
    ) as AlertMetric[];

    if (format === "json") {
      emitResult(list, format);
      return;
    }

    if (list.length === 0) {
      process.stdout.write("No alertable metrics found.\n");
      return;
    }

    const lines = renderBoxTable({
      headers: ["Metric", "Aggregations", "Unit", "Description"],
      rows: list.map((metric) => [
        metric.metricName,
        (metric.aggregators ?? []).join(", "),
        metric.unit ?? "-",
        metric.desc ?? "-",
      ]),
      align: ["left", "left", "left", "left"],
    });
    for (const line of lines) process.stdout.write(line + "\n");
  },
});
