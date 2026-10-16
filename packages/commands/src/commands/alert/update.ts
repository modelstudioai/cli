import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  ALERT_RULE_WRITE_FLAGS,
  buildAlertRuleReqDTO,
  ensureAlertReady,
  validateAlertRuleFlags,
} from "./shared.ts";

const UPDATE_RULE_API = "zeldaEasy.bailian-telemetry.alertRule.updateAlertRule";

export default defineCommand({
  description: {
    "en-US": "Update a model alert rule (full replacement; same fields as create)",
    "zh-CN": "更新模型告警规则（整体替换，字段与 create 一致）",
  },
  auth: "console",
  usageArgs: "--rule-id <id> --name <name> --template-id <id> --model <model> [flags]",
  flags: {
    ruleId: {
      type: "string",
      valueHint: "<id>",
      required: true,
      description: {
        "en-US": "Alert rule ID (from `alert list`)",
        "zh-CN": "告警规则 ID（可由 alert list 获得）",
      },
    },
    ...ALERT_RULE_WRITE_FLAGS,
  },
  exampleArgs: [
    "--rule-id 789 --name high-failure-rate --template-id 123 --model qwen3.6-plus --level WARNING",
    "--rule-id 789 --name nightly --template-id 123 --model qwen3.6-plus --silence 1800",
    "--rule-id 789 --name test --template-id 123 --model qwen3.6-plus --dry-run",
  ],
  validate: (flags) => validateAlertRuleFlags(flags),
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = {
      ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
      ruleId: flags.ruleId,
      ...buildAlertRuleReqDTO(flags),
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: UPDATE_RULE_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console(UPDATE_RULE_API, { reqDTO });

    if (format === "json") {
      emitResult({ updated: true, ruleId: flags.ruleId }, format);
      return;
    }

    process.stdout.write(`Alert rule updated: ${flags.ruleId}\n`);
  },
});
