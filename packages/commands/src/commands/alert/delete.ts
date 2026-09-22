import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { parseCommaList } from "../shared/params.ts";
import { ensureAlertReady } from "./shared.ts";

const DELETE_RULES_API = "zeldaEasy.bailian-telemetry.alertRule.deleteAlertRules";

export default defineCommand({
  description: {
    "en-US": "Delete model alert rules",
    "zh-CN": "删除模型告警规则",
  },
  auth: "console",
  risk: {
    level: "high",
    message: {
      "en-US": "This permanently deletes the specified alert rules and cannot be undone.",
      "zh-CN": "该操作会永久删除指定的告警规则，且无法撤销。",
    },
  },
  usageArgs: "--rule-id <id>[,<id>...] [--yes]",
  flags: {
    ruleId: {
      type: "string",
      valueHint: "<id>[,<id>...]",
      required: true,
      description: {
        "en-US": "Rule ID(s) to delete, comma-separated",
        "zh-CN": "要删除的规则 ID，多个以逗号分隔",
      },
    },
  },
  exampleArgs: ["--rule-id 789", "--rule-id 789,790 --dry-run", "--rule-id 789 --yes"],
  notes: [
    {
      "en-US": "Irreversible — the alert rules are permanently removed.",
      "zh-CN": "该操作不可撤销——告警规则将被永久删除。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = { ruleIds: parseCommaList(flags.ruleId) };

    if (settings.dryRun) {
      emitResult(
        {
          api: DELETE_RULES_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console(DELETE_RULES_API, { reqDTO });

    if (format === "json") {
      emitResult({ deleted: reqDTO.ruleIds }, format);
      return;
    }

    process.stdout.write(`Deleted ${reqDTO.ruleIds.length} alert rule(s).\n`);
  },
});
