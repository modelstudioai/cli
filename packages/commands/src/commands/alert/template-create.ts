import {
  defineCommand,
  BailianError,
  ExitCode,
  detectOutputFormat,
  effectiveConsoleGatewayConfig,
  unwrapResponse,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  ensureAlertReady,
  extractAlertPage,
  parseCondition,
  validateTemplateConditions,
  type TemplateCondition,
} from "./shared.ts";

const CREATE_TEMPLATE_API = "zeldaEasy.bailian-telemetry.alertTemplate.createAlertTemplate";
const LIST_TEMPLATES_API = "zeldaEasy.bailian-telemetry.alertTemplate.listAlertTemplates";

interface SourceTemplate {
  templateId: string;
  conditions?: TemplateCondition[];
  logicalOperator?: string;
}

/** Copy conditions from the source template when --from is given without --condition. */
async function resolveConditions(
  ctx: { client: Parameters<typeof ensureAlertReady>[0] },
  flags: { condition?: string[]; from?: string },
): Promise<TemplateCondition[]> {
  if (flags.condition?.length) return flags.condition.map(parseCondition);
  if (!flags.from) return [];

  const raw = await ctx.client.console(LIST_TEMPLATES_API, {
    reqDTO: { resourceType: "model", templateId: flags.from, maxResults: 1, skip: 0 },
  });
  const source = extractAlertPage<SourceTemplate>(raw).list[0];
  if (!source) {
    throw new BailianError(
      `Source template not found: ${flags.from}`,
      ExitCode.GENERAL,
      "Check the ID with `alert template list`.",
    );
  }
  return (source.conditions ?? []).map((condition) => ({
    metricName: condition.metricName,
    aggregator: condition.aggregator,
    compareType: condition.compareType,
    compareValue: condition.compareValue,
    period: condition.period,
  }));
}

export default defineCommand({
  description: {
    "en-US": "Create a custom alert template (or copy an official one with --from)",
    "zh-CN": "创建自定义告警模板（或用 --from 复制官方模板）",
  },
  auth: "console",
  usageArgs:
    "--name <name> [--condition <metric:agg:cmp:value:period>...] [--from <template-id>] [flags]",
  flags: {
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
          "Alert condition, repeatable (1-10). Example: 'model_call_failed_count:sum:>:10:60' (quote it: > is a shell metacharacter). See `alert metrics` for metric names",
        "zh-CN":
          "告警条件，可重复（1-10 条）。示例：'model_call_failed_count:sum:>:10:60'（含 > 等 shell 特殊字符，需加引号）。指标名见 `alert metrics`",
      },
    },
    from: {
      type: "string",
      valueHint: "<template-id>",
      description: {
        "en-US": "Copy conditions from an existing (e.g. official) template",
        "zh-CN": "复制已有（如官方）模板的条件",
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
    "--name 失败率告警 --condition 'model_call_failed_count:sum:>:10:60'",
    "--name 高延迟 --condition 'model_call_duration:avg:>:3000:300' --condition 'model_call_5xx_count:sum:>:5:60' --logical-operator and",
    "--name 我的模板 --from <template-id>",
    "--name test --condition 'model_call_count:sum:>:100:60' --dry-run",
  ],
  validate: (flags) => validateTemplateConditions(flags.condition, Boolean(flags.from)),
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";

    const conditions = flags.condition?.length ? flags.condition.map(parseCondition) : undefined;

    if (settings.dryRun) {
      emitResult(
        {
          api: CREATE_TEMPLATE_API,
          data: {
            reqDTO: {
              templateName: flags.name,
              resourceType: "model",
              logicalOperator: flags.logicalOperator ?? "or",
              srcTemplateId: flags.from,
              conditions: conditions ?? "(copied from --from template)",
            },
          },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    await ensureAlertReady(ctx.client, settings.workspaceId, ctx.identity.binName, settings);

    const reqDTO = {
      templateName: flags.name,
      resourceType: "model",
      logicalOperator: flags.logicalOperator ?? "or",
      srcTemplateId: flags.from,
      conditions: conditions ?? (await resolveConditions(ctx, flags)),
    };

    const raw = await ctx.client.console(CREATE_TEMPLATE_API, { reqDTO });
    const resp = unwrapResponse(raw as Record<string, unknown>);
    const templateId = (resp.data ?? resp.templateId ?? resp) as string | undefined;

    if (format === "json") {
      emitResult({ created: true, templateId }, format);
      return;
    }

    process.stdout.write(`Alert template created${templateId ? `: ${templateId}` : "."}\n`);
  },
});
