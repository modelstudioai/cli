import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { ensureAlertReady } from "./shared.ts";

export default defineCommand({
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
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = {
      workspaceId: settings.workspaceId,
      bizSource: "bailian",
      ruleId: flags.ruleId,
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: "zeldaEasy.bailian-telemetry.alertRule.enableAlertRule",
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console("zeldaEasy.bailian-telemetry.alertRule.enableAlertRule", { reqDTO });

    if (format === "json") {
      emitResult({ enabled: true, ruleId: flags.ruleId }, format);
      return;
    }

    process.stdout.write(`Alert rule enabled: ${flags.ruleId}\n`);
  },
});
