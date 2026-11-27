import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineCommand } from "bailian-cli-core";
import { validateServer } from "./server-management.ts";
import { listServerTools, toolServerFlag } from "./tool-response.ts";

export default defineCommand({
  auth: "apiKey",
  description: {
    "en-US": "List a Bailian MCP server's tools and input schemas via OpenAPI",
    "zh-CN": "通过百炼 OpenAPI 列出指定 MCP 服务的工具及入参定义",
  },
  flags: {
    ...WORKSPACE_FLAG,
    server: toolServerFlag,
  },
  usageArgs: "--server <code> [--dry-run]",
  exampleArgs: ["--server mcp-example", "--server mcp-example --dry-run"],
  notes: [
    {
      "en-US":
        "Fetching tools may activate a OneKey service. Dry-run previews the request locally.",
      "zh-CN": "查询工具可能触发 OneKey 服务开通。--dry-run 仅在本地预览请求。",
    },
  ],
  validate: (flags) => validateServer(flags.server),
  async prepare(ctx) {
    const server = ctx.flags.server;
    return { data: undefined, preview: { server, action: "list_tools" }, risk: null, notices: [] };
  },
  async run(ctx) {
    ctx.output.result(await listServerTools(ctx, ctx.flags.server));
  },
});
