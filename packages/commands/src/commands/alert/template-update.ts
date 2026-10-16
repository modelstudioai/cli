import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { ensureAlertReady, parseCondition, validateTemplateConditions } from "./shared.ts";

const UPDATE_TEMPLATE_API = "zeldaEasy.bailian-telemetry.alertTemplate.updateAlertTemplate";

export default defineCommand({
  description: {
    "en-US": "Update a custom alert template (full replacement of conditions)",
    "zh-CN": "更新自定义告警模板（整体替换条件）",
  },
  auth: "console",
  usageArgs:
    "--template-id <id> --name <name> --condition <metric:agg:cmp:value:period>... [flags]",
  flags: {
    templateId: {
      type: "string",
      valueHint: "<id>",
      required: true,
      description: {
        "en-US": "Template ID (from `alert template list`)",
        "zh-CN": "模板 ID（可由 alert template list 获得）",
      },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      required: true,
      description: {
        "en-US": "Template name (max 64 chars)",
        "zh-CN": "模板名称（最长 64 字符）",
      },
    },
    condition: {
      type: "array",
      valueHint: "<metric:agg:cmp:value:period>",
      description: {
        "en-US":
          "Alert condition, repeatable (1-10). Example: 'model_call_failed_count:sum:>:10:60' (quote it: > is a shell metacharacter)",
        "zh-CN":
          "告警条件，可重复（1-10 条）。示例：'model_call_failed_count:sum:>:10:60'（含 > 等 shell 特殊字符，需加引号）",
      },
    },
    logicalOperator: {
      type: "string",
      valueHint: "<op>",
      choices: ["or", "and"] as const,
      description: {
        "en-US": "How multiple conditions combine (default: or)",
        "zh-CN": "多条件组合逻辑（默认：or）",
      },
    },
  },
  exampleArgs: [
    "--template-id 123 --name 失败率告警 --condition 'model_call_failed_count:sum:>:20:60'",
    "--template-id 123 --name test --condition 'model_call_count:sum:>:100:60' --dry-run",
  ],
  validate: (flags) => validateTemplateConditions(flags.condition, false),
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const reqDTO = {
      templateId: flags.templateId,
      templateName: flags.name,
      resourceType: "model",
      logicalOperator: flags.logicalOperator ?? "or",
      conditions: (flags.condition ?? []).map(parseCondition),
    };

    if (settings.dryRun) {
      emitResult(
        {
          api: UPDATE_TEMPLATE_API,
          data: { reqDTO },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    await ctx.client.console(UPDATE_TEMPLATE_API, { reqDTO });

    if (format === "json") {
      emitResult({ updated: true, templateId: flags.templateId }, format);
      return;
    }

    process.stdout.write(`Alert template updated: ${flags.templateId}\n`);
  },
});
