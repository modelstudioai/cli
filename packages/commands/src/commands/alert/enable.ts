import { defineTelemetryCommand, telemetryGatewayPreview } from "../shared/telemetry.ts";
import { ensureAlertReady } from "./shared.ts";

export default defineTelemetryCommand({
  description: {
    "en-US": "Enable a model alert rule",
    "zh-CN": "启用模型告警规则",
  },
  auth: "console",
  usageArgs: "--rule-id <id> [flags]",
  flags: {
    ruleId: {
      type: "string",
      valueHint: "<id>",
      required: true,
      description: {
        "en-US": "Alert rule ID",
        "zh-CN": "告警规则 ID",
      },
    },
  },
  exampleArgs: ["--rule-id 789", "--rule-id 789 --dry-run"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.output;

    const reqDTO = {
      workspaceId: settings.workspaceId,
      bizSource: "bailian",
      ruleId: flags.ruleId,
    };

    if (settings.dryRun) {
      ctx.output.result({
        api: "zeldaEasy.bailian-telemetry.alertRule.enableAlertRule",
        data: { reqDTO },
        ...telemetryGatewayPreview(settings),
      });
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console("zeldaEasy.bailian-telemetry.alertRule.enableAlertRule", { reqDTO });

    ctx.output.result(
      { enabled: true, ruleId: flags.ruleId },
      format === "text"
        ? {
            text: ctx.localize({
              "en-US": `Alert rule enabled: ${flags.ruleId}`,
              "zh-CN": `告警规则已启用: ${flags.ruleId}`,
            }),
          }
        : undefined,
    );
  },
});
