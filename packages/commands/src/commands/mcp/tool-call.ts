import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { BailianError, defineCommand, ExitCode, mcpServersPath } from "bailian-cli-core";
import {
  argumentFlags,
  toolArguments,
  toolErrorMessage,
  validateArguments,
} from "./call-arguments.ts";
import { validateServer } from "./server-management.ts";
import { requestMcpData } from "./server-response.ts";
import { toolServerFlag } from "./tool-response.ts";

const flags = {
  ...WORKSPACE_FLAG,
  server: toolServerFlag,
  tool: {
    type: "string",
    required: true,
    valueHint: "<name>",
    description: {
      "en-US": "Tool name returned by tool list or tool search",
      "zh-CN": "tool list 或 tool search 返回的工具名",
    },
  },
  ...argumentFlags,
} as const;
interface CallPlan {
  server: string;
  tool: string;
  tool_params: Record<string, unknown>;
}

interface ContentBlock {
  type?: string | null;
  text?: string | null;
}
function isContentBlock(value: unknown): value is ContentBlock {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (!("type" in value) || value.type == null || typeof value.type === "string") &&
    (!("text" in value) || value.text == null || typeof value.text === "string")
  );
}

function readResult(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  if (!("is_error" in data) && !("isError" in data) && !("content" in data)) return;
  const isError = "is_error" in data ? data.is_error : "isError" in data ? data.isError : null;
  const content = "content" in data ? data.content : null;
  if (isError != null && typeof isError !== "boolean") return;
  if (content != null && (!Array.isArray(content) || !content.every(isContentBlock))) return;
  return { is_error: isError ?? null, content: content ?? null };
}

export default defineCommand<typeof flags, CallPlan>({
  auth: "apiKey",
  description: {
    "en-US": "Call a Bailian MCP tool via OpenAPI",
    "zh-CN": "通过百炼 OpenAPI 调用 MCP 工具",
  },
  flags,
  usageArgs:
    "--server <code> --tool <name> [--json '{...}'] [--arg k=v ...] [--query <text>] [--dry-run]",
  exampleArgs: [
    "--server mcp-example --tool getOrder --arg orderId=A123 --dry-run",
    "--workspace-id ws-example --server mcp-example --tool getOrder --arg orderId=A123",
  ],
  notes: [
    {
      "en-US":
        "Dry-run previews the arguments locally. Calling a tool may activate a OneKey service. A tool-reported error returns its content and exits with code 1.",
      "zh-CN":
        "--dry-run 在本地预览调用参数。调用工具可能触发 OneKey 服务开通。工具自身报错时输出返回内容，并以退出码 1 结束。",
    },
  ],
  validate(flags) {
    if (!flags.tool.trim()) {
      return {
        "en-US": "--tool requires a nonblank tool name.",
        "zh-CN": "--tool 需要非空白的工具名。",
      };
    }
    return validateServer(flags.server) ?? validateArguments(flags);
  },
  async prepare(ctx) {
    const { server, tool } = ctx.flags;
    const params = toolArguments(ctx.flags, ctx.localize);
    return {
      data: { server, tool, tool_params: params },
      preview: {
        action: "call_tool",
        server,
        tool,
        ...(ctx.settings.dryRun ? { tool_params: params } : {}),
      },
      risk: null,
      notices: [],
    };
  },
  async run(ctx) {
    const plan = ctx.prepared;
    if (!plan)
      throw new BailianError(
        ctx.localize({
          "en-US": "Missing MCP tool call plan.",
          "zh-CN": "缺少 MCP 工具调用计划。",
        }),
      );
    const { data, requestId } = await requestMcpData<unknown>(ctx, {
      method: "POST",
      path: `${mcpServersPath(plan.server)}/tools/call`,
      body: { tool_name: plan.tool, tool_params: plan.tool_params },
    });
    const result = readResult(data);
    if (!result)
      throw new BailianError(
        ctx.localize({
          "en-US": "The MCP tool call response is invalid.",
          "zh-CN": "MCP 工具调用响应格式无效。",
        }),
        ExitCode.GENERAL,
        undefined,
        { api: { requestId } },
      );
    ctx.output.result(result);
    if (result.is_error)
      throw new BailianError(
        toolErrorMessage(result.content, ctx.localize),
        ExitCode.GENERAL,
        undefined,
        { api: { requestId } },
      );
  },
});
