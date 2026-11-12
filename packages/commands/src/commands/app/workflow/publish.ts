import { UsageError, defineCommand } from "bailian-cli-core";
import {
  APP_ID_FLAG,
  FLOW_PUBLISH_API,
  asRecord,
  consoleCall,
  consoleDryRunPreview,
  fetchWorkflowCanvas,
  normalizeTriggerList,
  triggersFromCanvas,
} from "../shared.ts";

export default defineCommand({
  description: {
    "en-US": "Publish a workflow (publishes the current draft canvas)",
    "zh-CN": "发布工作流（发布当前草稿画布）",
  },
  auth: "console",
  usageArgs: "--app-id <id> [flags]",
  flags: {
    ...APP_ID_FLAG,
    description: {
      type: "string",
      valueHint: "<text>",
      description: { "en-US": "Version description", "zh-CN": "版本描述" },
    },
    triggerList: {
      type: "string",
      valueHint: "<json>",
      description: {
        "en-US": "Trigger list JSON array (default: read from the current draft)",
        "zh-CN": "触发器列表 JSON 数组（默认：从当前草稿读取）",
      },
    },
  },
  notes: [
    {
      "en-US":
        "Reads the current draft canvas and version, then publishes. Triggers are taken from the draft (applicationConfigDTO.triggerList, falling back to the Start node) unless --trigger-list is given; 'none' triggers are dropped. Requires a console token even for --dry-run (read-only planning).",
      "zh-CN":
        "先读取当前草稿画布与版本再发布。触发器默认取自草稿（applicationConfigDTO.triggerList，兜底 Start 节点），除非显式传 --trigger-list；'none' 触发器会被过滤。--dry-run 也需要 console 凭证（只读规划）。",
    },
  ],
  exampleArgs: [
    "--app-id abc123",
    '--app-id abc123 --description "Release v2"',
    "--app-id abc123 --trigger-list '[]'",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const appCode = flags.appId;

    let explicitTriggers: unknown[] | undefined;
    if (flags.triggerList !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(flags.triggerList);
      } catch {
        throw new UsageError("--trigger-list must be valid JSON");
      }
      if (!Array.isArray(parsed)) {
        throw new UsageError("--trigger-list must be a JSON array");
      }
      explicitTriggers = parsed;
    }

    const canvas = await fetchWorkflowCanvas(ctx.client, appCode);
    const applicationConfig = asRecord(canvas.applicationDTO?.applicationConfigDTO);
    const rawTriggers =
      explicitTriggers ?? applicationConfig.triggerList ?? triggersFromCanvas(canvas.config);
    const triggerList = normalizeTriggerList(rawTriggers);

    const data: Record<string, unknown> = {
      appCode,
      config: canvas.config,
      version: canvas.version,
      triggerList,
    };
    if (flags.description !== undefined) data.description = flags.description;

    if (settings.dryRun) {
      ctx.output.result(consoleDryRunPreview(settings, FLOW_PUBLISH_API, data));
      return;
    }

    const payload = await consoleCall(ctx.client, FLOW_PUBLISH_API, data);
    ctx.output.result(
      { app_code: appCode, version: canvas.version, result: payload },
      settings.output === "text"
        ? {
            text: ctx.localize({
              "en-US": `Workflow ${appCode} published.`,
              "zh-CN": `工作流 ${appCode} 已发布。`,
            }),
          }
        : undefined,
    );
  },
});
