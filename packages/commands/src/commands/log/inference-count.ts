import { type FlagsDef } from "bailian-cli-core";
import {
  defineTelemetryCommand,
  TELEMETRY_LOG_TIME_FLAGS,
  resolveTimeRange,
} from "../shared/telemetry.ts";
import { countLogs, validateInferenceCountFlags } from "./shared.ts";

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

export default defineTelemetryCommand({
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
  exampleArgs: [
    "",
    "--model qwen3.6-plus --hours 24",
    "--model qwen3.6-plus,qwen3.6-flash --hours 144",
    "--output json",
  ],
  notes: [
    {
      "en-US":
        "Uses the inference list API's totalCount for the selected time range and filters. Fetches at most one metadata row per response, without full request/response content or pagination.",
      "zh-CN":
        "采用推理列表接口中对应时间范围和过滤条件的 totalCount。每次响应最多获取一条元数据，不获取完整请求/响应内容，也不遍历分页。",
    },
    {
      "en-US":
        "Comma-separated models and API key IDs are deduplicated, then queried sequentially as single-model/single-key combinations. The counts are summed only after every query succeeds.",
      "zh-CN":
        "逗号分隔的模型和 API Key ID 会先去重，再按单模型、单 Key 组合依次查询。仅在全部查询成功后输出汇总计数。",
    },
  ],
  validate: validateInferenceCountFlags,
  async run(ctx) {
    await countLogs(ctx, "inference", ctx.flags, () => resolveTimeRange(ctx.flags, 1 / 24));
  },
});
