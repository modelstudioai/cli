import { defineCommand, detectOutputFormat, effectiveConsoleGatewayConfig } from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  buildGroupSwitchReqDTO,
  DISABLE_GROUP_API,
  ensureTelemetryRegionSupported,
} from "../shared/telemetry.ts";

/** Delivery switch telemetryType for model monitoring. */
const MONITOR_GROUP_TYPE = "Monitor";

export default defineCommand({
  description: {
    "en-US": "Disable monitor delivery for all models in the workspace",
    "zh-CN": "关闭当前业务空间全部模型的监控数据投递",
  },
  auth: "console",
  usageArgs: "[flags]",
  notes: [
    {
      "en-US":
        "Only the delivery switch is turned off; the CMS service and the Prometheus instance (with stored data) are kept. Re-enable with `monitor delivery enable`.",
      "zh-CN":
        "仅关闭投递开关；CMS 服务与 Prometheus 实例（含已存储数据）保留。可用 `monitor delivery enable` 重新开启。",
    },
  ],
  exampleArgs: ["", "--dry-run", "--output json"],
  async run(ctx) {
    const { settings } = ctx;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          api: DISABLE_GROUP_API,
          data: { reqDTO: buildGroupSwitchReqDTO(settings, MONITOR_GROUP_TYPE) },
          ...effectiveConsoleGatewayConfig(settings),
        },
        format,
      );
      return;
    }

    ensureTelemetryRegionSupported(settings);

    await ctx.client.console(DISABLE_GROUP_API, {
      reqDTO: buildGroupSwitchReqDTO(settings, MONITOR_GROUP_TYPE),
    });

    if (format === "json") {
      emitResult({ disabled: true }, format);
      return;
    }

    process.stdout.write("Monitor delivery disabled.\n");
  },
});
