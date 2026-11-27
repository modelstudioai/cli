import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineCommand } from "bailian-cli-core";
import {
  batchServerFlag,
  prepareLifecycle,
  runLifecycle,
  validateServers,
  type LifecyclePlan,
} from "./server-lifecycle.ts";

const flags = {
  ...WORKSPACE_FLAG,
  server: batchServerFlag,
  noBrowser: {
    type: "switch",
    description: {
      "en-US": "Print the console link without opening it when manual setup is required",
      "zh-CN": "需要手动配置时只输出控制台链接",
    },
  },
} as const;

export default defineCommand<typeof flags, LifecyclePlan>({
  description: {
    "en-US":
      "Activate official MCP servers or enable custom servers using their saved configuration",
    "zh-CN": "开通官方 MCP 服务，或使用已保存的配置启用自定义服务",
  },
  auth: "apiKey",
  flags,
  usageArgs: "--server <code,...> [--no-browser] [--dry-run]",
  exampleArgs: ["--server mcp-example,mcp-weather --dry-run", "--server mcp-example"],
  notes: [
    {
      "en-US":
        "OneKey activation may place an order. ACTIVATING means the deployment is still in progress. Use mcp list to see servers once they are active.",
      "zh-CN":
        "开通 OneKey 服务可能下单。ACTIVATING 表示部署仍在进行。部署完成后可用 mcp list 查询已启用的服务。",
    },
  ],
  validate: (values) => validateServers(values.server),
  prepare: (ctx) => prepareLifecycle(ctx, ctx.flags.server, "activate"),
  run: (ctx) => runLifecycle(ctx, !ctx.flags.noBrowser),
});
