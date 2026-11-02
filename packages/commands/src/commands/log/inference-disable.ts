import { defineTelemetryCommand } from "../shared/telemetry.ts";
import { disableLogDelivery } from "./shared.ts";

export default defineTelemetryCommand({
  description: {
    "en-US": "Disable inference log delivery for all models in the workspace",
    "zh-CN": "关闭当前业务空间全部模型的推理日志投递",
  },
  auth: "console",
  usageArgs: "[flags]",
  notes: [
    {
      "en-US":
        "Only the inference log (request/response content) is disabled; the audit log keeps its own switch (`log audit disable`).",
      "zh-CN": "仅关闭推理日志（请求/响应内容）；审计日志有独立开关（`log audit disable`）。",
    },
  ],
  exampleArgs: ["", "--dry-run", "--output json"],
  async run(ctx) {
    await disableLogDelivery(
      {
        client: ctx.client,
        output: ctx.output,
        settings: ctx.settings,
        binName: ctx.identity.binName,
      },
      "inference",
    );
  },
});
