import { defineTelemetryCommand, telemetryGatewayPreview } from "../shared/telemetry.ts";
import { parseCommaList } from "../shared/params.ts";
import { ensureAlertReady } from "./shared.ts";

const DELETE_RULES_API = "zeldaEasy.bailian-telemetry.alertRule.deleteAlertRules";

export default defineTelemetryCommand({
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
    const format = settings.output;

    const reqDTO = { ruleIds: parseCommaList(flags.ruleId) };

    if (settings.dryRun) {
      ctx.output.result({
        api: DELETE_RULES_API,
        data: { reqDTO },
        ...telemetryGatewayPreview(settings),
      });
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console(DELETE_RULES_API, { reqDTO });

    ctx.output.result(
      { deleted: reqDTO.ruleIds },
      format === "text"
        ? {
            text: ctx.localize({
              "en-US": `Deleted ${reqDTO.ruleIds.length} alert rule(s).`,
              "zh-CN": `已删除 ${reqDTO.ruleIds.length} 个告警规则。`,
            }),
          }
        : undefined,
    );
  },
});
