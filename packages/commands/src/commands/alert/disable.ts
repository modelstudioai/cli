import { defineTelemetryCommand, telemetryGatewayPreview } from "../shared/telemetry.ts";
import { ensureAlertReady } from "./shared.ts";

const DISABLE_RULE_API = "zeldaEasy.bailian-telemetry.alertRule.disableAlertRule";

export default defineTelemetryCommand({
  description: {
    "en-US": "Disable a model alert rule (keeps the rule, stops notifications)",
    "zh-CN": "停用模型告警规则（保留规则，停止通知）",
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
        api: DISABLE_RULE_API,
        data: { reqDTO },
        ...telemetryGatewayPreview(settings),
      });
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console(DISABLE_RULE_API, { reqDTO });

    ctx.output.result(
      { enabled: false, ruleId: flags.ruleId },
      format === "text"
        ? {
            text: ctx.localize({
              "en-US": `Alert rule disabled: ${flags.ruleId}`,
              "zh-CN": `告警规则已停用: ${flags.ruleId}`,
            }),
          }
        : undefined,
    );
  },
});
