import { defineCommand, type CommandRisk } from "bailian-cli-core";
import { searchTools } from "./tool-response.ts";

const defaultLimit = 10;
const searchRisk = {
  level: "high",
  reason: "billing",
  message: {
    "en-US":
      "Requesting recommendations may trigger OneKey activation and place an order on your account.",
    "zh-CN": "请求工具推荐可能为当前账号触发 OneKey 开通或下单。",
  },
} satisfies CommandRisk;

export default defineCommand({
  auth: "apiKey",
  description: {
    "en-US": "Find recommended MCP tools for a natural-language query",
    "zh-CN": "根据自然语言需求查找推荐的 MCP 工具",
  },
  flags: {
    query: {
      type: "string",
      required: true,
      valueHint: "<text>",
      description: {
        "en-US": "Describe what you want the tool to do",
        "zh-CN": "描述希望工具完成的任务",
      },
    },
    limit: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Maximum results to show (default 10)",
        "zh-CN": "最多展示的工具数（默认 10）",
      },
    },
  },
  usageArgs: "--query <text> [--limit <n>] [--yes] [--dry-run]",
  exampleArgs: [
    { "en-US": '--query "look up an order" --dry-run', "zh-CN": '--query "查询订单" --dry-run' },
    {
      "en-US": '--query "look up an order" --limit 5 --yes',
      "zh-CN": '--query "查询订单" --limit 5 --yes',
    },
  ],
  risk: searchRisk,
  validate({ query, limit = defaultLimit }) {
    if (!query.trim()) {
      return { "en-US": "--query must contain text.", "zh-CN": "--query 须包含非空白文本。" };
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 2_147_483_647) {
      return {
        "en-US": "--limit must be an integer from 1 to 2147483647.",
        "zh-CN": "--limit 须为 1～2147483647 的整数。",
      };
    }
  },
  async prepare(ctx) {
    const query = ctx.flags.query.trim();
    const limit = ctx.flags.limit ?? defaultLimit;
    return {
      data: undefined,
      preview: { action: "recommend_tools", query, limit },
      risk: searchRisk,
      notices: [],
    };
  },
  async run(ctx) {
    ctx.output.result(
      await searchTools(ctx, ctx.flags.query.trim(), ctx.flags.limit ?? defaultLimit),
    );
  },
});
