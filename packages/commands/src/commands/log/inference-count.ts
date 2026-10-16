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
    "en-US": "Count model inference logs in a time range (useful before exporting)",
    "zh-CN": "统计时间范围内的模型推理日志条数（导出前预估量级）",
  },
  auth: "console",
  usageArgs: "[--model <model>] [--hours <n>] [flags]",
  flags: {
    ...TELEMETRY_LOG_TIME_FLAGS,
    ...COUNT_FILTER_FLAGS,
  },
  exampleArgs: ["", "--model qwen3.6-plus --hours 24", "--output json"],
  notes: [
    {
      "en-US": "Only calls made while inference log delivery was enabled are counted.",
      "zh-CN": "仅统计推理日志投递开启期间产生的调用。",
    },
  ],
  validate: (flags) => validateHoursFlag(flags.hours as number | undefined),
  async run(ctx) {
    await countLogs(ctx, "inference", ctx.flags as LogCountFlags, () =>
      resolveTimeRange(ctx.flags as LogCountFlags, 1 / 24),
    );
  },
});
