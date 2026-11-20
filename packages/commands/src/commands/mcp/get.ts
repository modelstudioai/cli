import { BailianError, defineCommand } from "bailian-cli-core";
import { validateServer } from "./server-management.ts";
import { requestMcpServer } from "./server-response.ts";
import { listServerTools, serverToolsRisk, toolServerFlag, toolsRisk } from "./tool-response.ts";

const flags = { server: toolServerFlag };

type ServerDetail = Awaited<ReturnType<typeof requestMcpServer>>["detail"];
export default defineCommand<typeof flags, ServerDetail>({
  description: {
    "en-US": "Get an MCP server's details and tool definitions",
    "zh-CN": "查询 MCP 服务详情和工具定义",
  },
  auth: "apiKey",
  flags,
  risk: toolsRisk,
  usageArgs: "--server <code> [flags]",
  exampleArgs: ["--server mcp-example", "--server mcp-example --dry-run"],
  notes: [
    {
      "en-US":
        "Billing shows the reported mode, unit price and free quota, or null when unavailable. Dry-run retrieves only server details. Tool discovery requires confirmation for OneKey or unknown activation policies. If tool discovery fails, the detail result contains tools=null and the command exits with the error.",
      "zh-CN":
        "billing 展示服务端提供的计费模式、单价和免费额度，未提供时为 null。预览只读取服务详情。OneKey 服务或开通方式未知时，查询工具须确认。工具查询失败时仍输出详情，tools 为 null，并返回错误退出码。",
    },
  ],
  validate: (values) => validateServer(values.server),
  async prepare(ctx) {
    const { detail } = await requestMcpServer(ctx, "GET", ctx.flags.server);
    return {
      data: detail,
      preview: { ...detail, action: "list_tools" },
      risk: serverToolsRisk(detail),
      notices: [],
    };
  },
  async run(ctx) {
    const detail = ctx.prepared;
    if (!detail)
      throw new BailianError(
        ctx.localize({ "en-US": "Missing MCP server details.", "zh-CN": "缺少 MCP 服务详情。" }),
      );
    let tools;
    try {
      tools = await listServerTools(ctx, detail.server_code);
    } catch (error) {
      ctx.output.result({ ...detail, tools: null });
      throw error;
    }
    ctx.output.result({ ...detail, tools });
  },
});
