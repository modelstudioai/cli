import {
  BailianError,
  ExitCode,
  mcpServersPath,
  type CommandContext,
  type CommandRisk,
} from "bailian-cli-core";
import { serverFlag } from "./server-management.ts";
import { requestMcpData, requestMcpServer } from "./server-response.ts";

export const toolServerFlag = {
  ...serverFlag,
  description: {
    "en-US": "Official or custom MCP server code",
    "zh-CN": "官方或自定义 MCP 服务编码",
  },
};

export const toolsRisk = {
  level: "high",
  reason: "billing",
  message: {
    "en-US": "Fetching tools may activate a OneKey MCP service or place an order on your account.",
    "zh-CN": "查询工具可能为当前账号开通 OneKey MCP 服务或下单。",
  },
} satisfies CommandRisk;

export function serverToolsRisk(
  detail: { type: string | null; is_onekey: boolean | null },
  risk: CommandRisk = toolsRisk,
) {
  return detail.type === "CUSTOMER" || detail.is_onekey === false ? null : risk;
}

type ReadContext = Pick<CommandContext, "client" | "localize">;

export async function resolveToolRisk(
  ctx: ReadContext & Pick<CommandContext, "settings" | "confirmed">,
  server: string,
  risk: CommandRisk,
) {
  if (ctx.settings.dryRun || ctx.confirmed) return risk;
  const { detail } = await requestMcpServer(ctx, "GET", server);
  return serverToolsRisk(detail, risk);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResponse(ctx: ReadContext, requestId?: string) {
  return new BailianError(
    ctx.localize({
      "en-US": "The MCP tools response is invalid.",
      "zh-CN": "MCP 工具列表响应格式无效。",
    }),
    ExitCode.GENERAL,
    undefined,
    { api: { requestId } },
  );
}

function inputSchema(value: unknown, ctx: ReadContext, requestId?: string) {
  if (value == null) return null;
  if (!isRecord(value)) throw invalidResponse(ctx, requestId);
  // Only the DTO's own keys change casing. Properties and required are downstream schema data.
  return {
    type: value.type,
    properties: value.properties,
    required: value.required,
    additional_properties: value.additional_properties ?? value.additionalProperties ?? null,
  };
}

export async function listServerTools(ctx: ReadContext, server: string) {
  const { data, requestId } = await requestMcpData<unknown>(ctx, {
    method: "GET",
    path: `${mcpServersPath(server)}/tools`,
  });
  if (!Array.isArray(data)) throw invalidResponse(ctx, requestId);
  return data.map((tool: unknown) => {
    if (!isRecord(tool)) throw invalidResponse(ctx, requestId);
    return {
      name: tool.name ?? null,
      description: tool.description ?? null,
      input_schema: inputSchema(tool.input_schema ?? tool.inputSchema, ctx, requestId),
    };
  });
}

export async function searchTools(ctx: ReadContext, query: string, limit: number) {
  const params = new URLSearchParams({ query, topN: String(limit) });
  const { data, requestId } = await requestMcpData<unknown>(ctx, {
    method: "GET",
    path: `${mcpServersPath()}/tools/recommend?${params.toString()}`,
  });
  if (!Array.isArray(data)) throw invalidResponse(ctx, requestId);
  return data.slice(0, limit).map((tool: unknown) => {
    if (!isRecord(tool)) throw invalidResponse(ctx, requestId);
    const serverCode = tool.mcp_code ?? tool.mcpCode ?? tool.server_code ?? tool.serverCode;
    const toolName = tool.tool_name ?? tool.toolName;
    if (
      typeof serverCode !== "string" ||
      !serverCode.trim() ||
      typeof toolName !== "string" ||
      !toolName.trim()
    )
      throw invalidResponse(ctx, requestId);
    return {
      server_code: serverCode,
      tool_name: toolName,
      tool_description: tool.tool_description ?? tool.toolDescription ?? null,
      tool_input_schema: inputSchema(
        tool.tool_input_schema ?? tool.toolInputSchema,
        ctx,
        requestId,
      ),
    };
  });
}
