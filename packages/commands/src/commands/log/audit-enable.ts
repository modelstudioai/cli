import { formatCommand } from "bailian-cli-core";
import { defineTelemetryCommand } from "../shared/telemetry.ts";
import { LOG_NO_WAIT_FLAG, enableLogDelivery } from "./shared.ts";
import { LOG_SERVICE_TYPES } from "./status.ts";

export default defineTelemetryCommand({
  description: {
    "en-US": "Enable audit log delivery to SLS (SLR check → SLS instance → log switch)",
    "zh-CN": "开启审计日志投递到 SLS（SLR 校验 → SLS 实例初始化 → 打开日志开关）",
  },
  auth: "console",
  usageArgs: "[--no-wait] [flags]",
  flags: LOG_NO_WAIT_FLAG,
  notes: [
    {
      "en-US":
        "Steps: 1) verify the SLS service-linked role is authorized (stops with manual-authorization guidance when missing), 2) initialize the SLS store instance (async), 3) turn on audit log delivery for all models in the workspace.",
      "zh-CN":
        "开启链路：1）校验 SLS 服务关联角色已授权（未授权时停止并引导手动开通）；2）初始化 SLS 存储实例（异步）；3）为当前业务空间全部模型打开审计日志开关。",
    },
    {
      "en-US":
        "The audit log records call metadata only and is required before enabling the inference log.",
      "zh-CN": "审计日志只记录调用元数据，且是开启推理日志的前置条件。",
    },
  ],
  exampleArgs: ["", "--no-wait", "--output json"],
  async run(ctx) {
    await enableLogDelivery(
      {
        client: ctx.client,
        output: ctx.output,
        settings: ctx.settings,
        commandPrefix: formatCommand(ctx.identity),
        localize: ctx.localize,
        noWait: ctx.flags.noWait,
      },
      "audit",
      LOG_SERVICE_TYPES.audit,
    );
  },
});
