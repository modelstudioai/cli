import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { LOG_NO_WAIT_FLAG, enableLogDelivery, requireAuditLogEnabled } from "./shared.ts";
import { LOG_SERVICE_TYPES } from "./status.ts";

export default defineCommand({
  description: {
    "en-US": "Enable inference log delivery to SLS (SLR authorization → SLS instance → log switch)",
    "zh-CN": "开启推理日志投递到 SLS（SLR 授权 → SLS 实例初始化 → 打开日志开关）",
  },
  auth: "console",
  usageArgs: "[--no-wait] [flags]",
  flags: LOG_NO_WAIT_FLAG,
  notes: [
    {
      "en-US":
        "Steps: 1) authorize the SLS service-linked role, 2) initialize the SLS store instance (async), 3) turn on inference log delivery for all models in the workspace.",
      "zh-CN":
        "开启链路：1）授权 SLS 服务关联角色；2）初始化 SLS 存储实例（异步）；3）为当前业务空间全部模型打开推理日志开关。",
    },
    {
      "en-US":
        "Requires the audit log to be enabled first (`log audit enable`) — the console enforces the same rule.",
      "zh-CN": "需先开启审计日志（`log audit enable`）——与控制台规则一致。",
    },
  ],
  exampleArgs: ["", "--no-wait", "--output json"],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const enableContext = {
      client: ctx.client,
      settings: ctx.settings,
      binName: ctx.identity.binName,
      format,
      noWait: ctx.flags.noWait,
    };

    if (!ctx.settings.dryRun) {
      await requireAuditLogEnabled(ctx.client, ctx.settings.workspaceId, ctx.identity.binName);
    }

    await enableLogDelivery(enableContext, "inference", LOG_SERVICE_TYPES.inference);
  },
});
