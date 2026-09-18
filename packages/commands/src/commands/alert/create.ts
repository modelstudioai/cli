import {
  defineCommand,
  detectOutputFormat,
  effectiveConsoleGatewayConfig,
  unwrapResponse,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  ALERT_RULE_WRITE_FLAGS,
  buildAlertRuleReqDTO,
  ensureAlertReady,
  validateAlertRuleFlags,
} from "./shared.ts";

const CREATE_RULE_API = "zeldaEasy.bailian-telemetry.alertRule.createAlertRule";

export default defineCommand({
  description: {
    "en-US": "Create a model alert rule from an alert template",
    "zh-CN": "基于告警模板创建模型告警规则",
  },
  auth: "console",
  usageArgs: "--name <name> --template-id <id> --model <model> [flags]",
  flags: ALERT_RULE_WRITE_FLAGS,
  notes: [
    {
      "en-US":
        "Alert conditions come from the template; browse `alert template list` first. Notification contacts/contact groups are created in the CloudMonitor console — pass their IDs via --contact/--contact-group.",
      "zh-CN":
        "告警条件来自模板，请先用 `alert template list` 挑选。通知联系人/联系组需在云监控控制台创建，本命令通过 --contact/--contact-group 接收其 ID。",
    },
  ],
  exampleArgs: [
    "--name high-failure-rate --template-id 123 --model qwen3.6-plus",
    "--name latency --template-id 456 --model qwen3.6-plus,qwen-turbo --level ERROR --contact-group 4004200",
    "--name nightly --template-id 123 --model qwen3.6-plus --notify-window 09:00-18:00 --notify-days 1,2,3,4,5 --silence 3600",
    "--name test --template-id 123 --model qwen3.6-plus --dry-run",
  ],
  validate: (flags) => validateAlertRuleFlags(flags),
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = {
      ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
      ...buildAlertRuleReqDTO(flags),
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: CREATE_RULE_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    const raw = await ctx.client.console(CREATE_RULE_API, { reqDTO });
    const resp = unwrapResponse(raw as Record<string, unknown>);
    const ruleId = (resp.data ?? resp.ruleId ?? resp) as string | undefined;

    if (format === "json") {
      emitResult({ created: true, ruleId }, format);
      return;
    }

    process.stdout.write(`Alert rule created${ruleId ? `: ${ruleId}` : "."}\n`);
  },
});
