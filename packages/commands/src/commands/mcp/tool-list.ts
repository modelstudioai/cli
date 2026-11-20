import { defineCommand } from "bailian-cli-core";
import { validateServer } from "./server-management.ts";
import { listServerTools, resolveToolRisk, toolServerFlag, toolsRisk } from "./tool-response.ts";

export default defineCommand({
  auth: "apiKey",
  description: {
    "en-US": "List a Bailian MCP server's tools and input schemas via OpenAPI",
    "zh-CN": "通过百炼 OpenAPI 列出指定 MCP 服务的工具及入参定义",
  },
  flags: { server: toolServerFlag },
  usageArgs: "--server <code> [--yes] [--dry-run]",
  exampleArgs: ["--server mcp-example", "--server mcp-example --dry-run"],
  notes: [
    {
      "en-US":
        "Without --yes, server details are checked first. OneKey services and services with an unknown activation policy require confirmation. Dry-run previews the request locally.",
      "zh-CN":
        "未指定 --yes 时先查询服务详情。OneKey 服务或开通方式未知的服务须确认。--dry-run 仅在本地预览请求。",
    },
  ],
  validate: (flags) => validateServer(flags.server),
  risk: toolsRisk,
  async prepare(ctx) {
    const server = ctx.flags.server;
    const risk = await resolveToolRisk(ctx, server, toolsRisk);
    return { data: undefined, preview: { server, action: "list_tools" }, risk, notices: [] };
  },
  async run(ctx) {
    ctx.output.result(await listServerTools(ctx, ctx.flags.server));
  },
});
