import { defineCommand, UsageError } from "bailian-cli-core";
import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { invoke, runConnector } from "./shared.ts";

export default defineCommand({
  description: {
    "en-US": "Discover connector tools and authorized accounts by intent",
    "zh-CN": "按意图查找连接器工具与已授权账号",
  },
  auth: "apiKey",
  usageArgs: "--query <text> [--workspace-id <id>]",
  flags: {
    ...WORKSPACE_FLAG,
    query: {
      type: "string",
      required: true,
      valueHint: "<text>",
      description: {
        "en-US": "Describe the task and any preferred app or account",
        "zh-CN": "描述任务和指定的应用或账号",
      },
    },
  },
  exampleArgs: [
    { "en-US": '--query "Find tomorrow\'s meetings"', "zh-CN": '--query "查明天的会议"' },
  ],
  async run(ctx) {
    const { query } = ctx.flags;
    if (!query.trim()) throw new UsageError("--query must be non-empty.");
    const name = "CONNECTOR_SEARCH_TOOL";
    await runConnector(ctx, { tool: name, arguments: { query } }, (client) =>
      invoke(client, name, { query }),
    );
  },
});
