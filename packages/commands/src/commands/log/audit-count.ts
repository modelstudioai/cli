import { defineCommand, type FlagsDef } from "bailian-cli-core";
import { TELEMETRY_LOG_TIME_FLAGS, resolveTimeRange } from "../shared/telemetry.ts";
import { countLogs, validateHoursFlag, type LogCountFlags } from "./shared.ts";

const COUNT_FILTER_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Model name(s), comma-separated",
      "zh-CN": "模型名称，多个名称以逗号分隔",
    },
  },
  apiKeyId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "API key ID(s), comma-separated",
      "zh-CN": "API Key ID，多个以逗号分隔",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Count model audit logs in a time range (useful before exporting)",
    "zh-CN": "统计时间范围内的模型审计日志条数（导出前预估量级）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--hours <n>] [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    ...COUNT_FILTER_FLAGS,
  },
  exampleArgs: ["", "--model qwen3.6-plus --hours 24", "--output json"],
  validate: (flags) => validateHoursFlag(flags.hours as number | undefined),
  async run(ctx) {
    await countLogs(ctx, "audit", ctx.flags as LogCountFlags, () =>
      resolveTimeRange(ctx.flags as LogCountFlags, 1 / 24),
    );
  },
});
