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
};

export default defineCommand<typeof flags, LifecyclePlan>({
  description: {
    "en-US": "Deactivate official MCP servers or stop custom server deployments",
    "zh-CN": "关闭官方 MCP 服务，或停用自定义服务的部署",
  },
  auth: "apiKey",
  flags,
  usageArgs: "--server <code,...> [--dry-run]",
  exampleArgs: ["--server mcp-example,mcp-weather --dry-run", "--server mcp-example"],
  notes: [
    {
      "en-US":
        "Stopping a server can interrupt callers. Stopping a custom server keeps its definition and saved configuration. The service may reject deactivation for OneKey servers.",
      "zh-CN":
        "停用服务可能中断调用。停用自定义服务后会保留服务定义和已保存的配置。OneKey 服务可能拒绝关闭。",
    },
  ],
  validate: (values) => validateServers(values.server),
  prepare: (ctx) => prepareLifecycle(ctx, ctx.flags.server, "deactivate"),
  run: (ctx) => runLifecycle(ctx, false),
});
