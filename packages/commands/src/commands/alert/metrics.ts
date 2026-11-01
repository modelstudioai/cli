import { unwrapResponse } from "bailian-cli-core";
import { defineTelemetryCommand, telemetryGatewayPreview } from "../shared/telemetry.ts";
import { renderBoxTable } from "bailian-cli-runtime";
import { ensureAlertReady } from "./shared.ts";

const LIST_METRICS_API = "zeldaEasy.bailian-telemetry.alertMetric.listMetrics";

interface AlertMetric {
  metricName: string;
  aggregators: string[];
  desc: string;
  unit?: string;
  resourceType?: string;
}

export default defineTelemetryCommand({
  description: {
    "en-US": "List metrics that alert rules can be created on, with supported aggregations",
    "zh-CN": "查看可创建告警的指标及其支持的聚合方式",
  },
  auth: "console",
  usageArgs: "[flags]",
  exampleArgs: ["", "--output json"],
  async run(ctx) {
    const { settings } = ctx;
    const format = settings.output;

    if (settings.dryRun) {
      ctx.output.result({
        api: LIST_METRICS_API,
        data: { reqDTO: { workspaceId: settings.workspaceId, resourceType: "model" } },
        ...telemetryGatewayPreview(settings),
      });
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

    let text: string | undefined;
    if (format === "text") {
      if (list.length === 0) {
        text = ctx.localize({
          "en-US": "No alertable metrics found.",
          "zh-CN": "未找到可告警的指标。",
        });
      } else {
        const lines = renderBoxTable({
          headers: [
            ctx.localize({ "en-US": "Metric", "zh-CN": "指标" }),
            ctx.localize({ "en-US": "Aggregations", "zh-CN": "聚合方式" }),
            ctx.localize({ "en-US": "Unit", "zh-CN": "单位" }),
            ctx.localize({ "en-US": "Description", "zh-CN": "说明" }),
          ],
          rows: list.map((metric) => [
            metric.metricName,
            (metric.aggregators ?? []).join(", "),
            metric.unit ?? "-",
            metric.desc ?? "-",
          ]),
          align: ["left", "left", "left", "left"],
        });
        text = lines.join("\n");
      }
    }
    ctx.output.result(list, text === undefined ? undefined : { text });
  },
});
