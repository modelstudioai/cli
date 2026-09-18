import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { disableLogDelivery } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Disable audit log delivery for all models in the workspace",
    "zh-CN": "关闭当前业务空间全部模型的审计日志投递",
  },
  auth: "console",
  usageArgs: "[flags]",
  notes: [
    {
      "en-US":
        "Refused while the inference log is still enabled — disable the inference log first (the console enforces the same rule).",
      "zh-CN": "推理日志仍开启时不允许单独关闭审计日志——请先关闭推理日志（与控制台规则一致）。",
    },
  ],
  exampleArgs: ["", "--dry-run", "--output json"],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    await disableLogDelivery(
      {
        client: ctx.client,
        settings: ctx.settings,
        binName: ctx.identity.binName,
        format,
      },
      "audit",
      true,
    );
  },
});
