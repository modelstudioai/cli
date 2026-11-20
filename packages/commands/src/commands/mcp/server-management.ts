import {
  BailianError,
  ExitCode,
  type CommandContext,
  type FlagsDef,
  type LocalizedText,
  type ParsedFlags,
} from "bailian-cli-core";
import { MCP_TYPES, readMcpConfig } from "./server-config.ts";
import { requestMcpServer, type McpRequestContext } from "./server-response.ts";

export const serverFlag = {
  type: "string",
  required: true,
  valueHint: "<code>",
  description: { "en-US": "Custom MCP server code", "zh-CN": "自定义 MCP 服务编码" },
} as const;

export const editableFlags = {
  name: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Server name", "zh-CN": "服务名称" },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Server description", "zh-CN": "服务描述" },
  },
  mcpType: {
    type: "string",
    valueHint: "<stdio|http|sse|openapi>",
    description: { "en-US": "MCP type (case-insensitive)", "zh-CN": "MCP 类型（不区分大小写）" },
  },
  mcpConfig: {
    type: "string",
    valueHint: "<json|path>",
    description: {
      "en-US": "Complete MCP configuration as a JSON object or JSON file path",
      "zh-CN": "完整 MCP 配置，接受 JSON 对象字符串或 JSON 文件路径",
    },
  },
} satisfies FlagsDef;

export const deploymentNote = {
  "en-US":
    "Deploying a custom MCP server may incur charges, including Function Compute usage for STDIO.",
  "zh-CN": "部署自定义 MCP 服务可能产生费用，STDIO 部署可能产生函数计算用量费用。",
} satisfies LocalizedText;

type EditFlags = ParsedFlags<typeof editableFlags>;
type OperationContext = McpRequestContext & Pick<CommandContext, "output">;

export function validateServer(server: string): LocalizedText | undefined {
  if (!server.trim() || server === "." || server === "..") {
    return {
      "en-US": "--server requires a server code.",
      "zh-CN": "--server 需要有效的服务编码。",
    };
  }
}

export function validateEdits(flags: EditFlags): LocalizedText | undefined {
  for (const [name, value] of [
    ["--name", flags.name],
    ["--description", flags.description],
    ["--mcp-config", flags.mcpConfig],
  ]) {
    if (value !== undefined && !value.trim())
      return { "en-US": `${name} cannot be blank.`, "zh-CN": `${name} 不能为空。` };
  }
  if (
    flags.mcpType !== undefined &&
    !MCP_TYPES.some((type) => type === flags.mcpType?.toUpperCase())
  ) {
    return {
      "en-US": "--mcp-type must be stdio, http, sse or openapi.",
      "zh-CN": "--mcp-type 须为 stdio、http、sse 或 openapi。",
    };
  }
  if ((flags.mcpConfig === undefined) !== (flags.mcpType === undefined)) {
    return {
      "en-US": "Provide --mcp-type and --mcp-config together.",
      "zh-CN": "--mcp-type 和 --mcp-config 须同时提供。",
    };
  }
  if (
    flags.name === undefined &&
    flags.description === undefined &&
    flags.mcpConfig === undefined
  ) {
    return {
      "en-US": "Provide --name, --description, or both --mcp-type and --mcp-config.",
      "zh-CN": "请提供 --name、--description，或同时提供 --mcp-type 和 --mcp-config。",
    };
  }
}

export async function buildServerBody(flags: EditFlags, localize: CommandContext["localize"]) {
  const type = flags.mcpType?.toUpperCase();
  return {
    ...(flags.name !== undefined && { server_name: flags.name }),
    ...(flags.description !== undefined && { description: flags.description }),
    ...(type &&
      flags.mcpConfig && {
        mcp_type: type,
        mcp_config: await readMcpConfig(flags.mcpConfig, type, localize),
      }),
  };
}

type ServerBody = Awaited<ReturnType<typeof buildServerBody>>;
export interface ServerWrite {
  method: "POST" | "DELETE";
  server?: string;
  body?: ServerBody;
  registeredAgents?: string[];
}

async function requestServer(
  ctx: OperationContext,
  method: "GET" | "POST" | "DELETE",
  server?: string,
  body?: ServerBody,
) {
  const { detail, requestId, failReason } = await requestMcpServer(ctx, method, server, body);
  return {
    type: detail.type,
    result: {
      server_code: detail.server_code,
      mcp_code: detail.server_code,
      ...(detail.billing && { billing: detail.billing }),
      server_name: detail.server_name ?? undefined,
      server_status: detail.server_status ?? undefined,
      server_status_text: detail.server_status_text ?? undefined,
      activate_fail_reason: failReason ?? undefined,
      request_id: requestId,
    },
  };
}

export async function getCustomServer(ctx: OperationContext, server: string) {
  const { type, result } = await requestServer(ctx, "GET", server);
  if (type !== "CUSTOMER") {
    throw new BailianError(
      ctx.localize({
        "en-US": "This operation requires a custom MCP server (CUSTOMER).",
        "zh-CN": "此操作仅适用于自定义 MCP 服务（CUSTOMER）。",
      }),
      ExitCode.GENERAL,
      undefined,
      { api: { requestId: result.request_id } },
    );
  }
  return result;
}

export async function executeServerWrite(ctx: OperationContext & { prepared?: ServerWrite }) {
  if (!ctx.prepared)
    throw new BailianError(
      ctx.localize({ "en-US": "Missing MCP operation plan.", "zh-CN": "缺少 MCP 操作计划。" }),
    );
  const { method, server, body, registeredAgents } = ctx.prepared;
  let response;
  try {
    response = await requestServer(ctx, method, server, body);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.name === "TimeoutError" ||
        (error instanceof BailianError && error.exitCode === ExitCode.TIMEOUT))
    ) {
      throw new BailianError(
        ctx.localize({
          "en-US": "The MCP write timed out. Its outcome is unknown.",
          "zh-CN": "MCP 写请求已超时，操作结果尚未确认。",
        }),
        ExitCode.TIMEOUT,
        ctx.localize({
          "en-US": "Check the server in the Bailian console before retrying.",
          "zh-CN": "请先在百炼控制台核对服务状态，再决定是否重试。",
        }),
        { cause: error },
      );
    }
    throw error;
  }
  const { result } = response;
  ctx.output.result({ ...result, ...(registeredAgents && { connected_agents: registeredAgents }) });
  const status = result.server_status;
  const api = { requestId: result.request_id };
  if (status === "ACTIVATE_FAILED") {
    throw new BailianError(
      result.activate_fail_reason ?? result.server_status_text ?? status,
      ExitCode.GENERAL,
      undefined,
      { api },
    );
  }
  if ((method === "DELETE" && status !== "DELETED") || (body?.mcp_config && !status)) {
    throw new BailianError(
      ctx.localize({
        "en-US": "The MCP response did not confirm the operation status.",
        "zh-CN": "MCP 响应未确认操作状态。",
      }),
      ExitCode.GENERAL,
      undefined,
      { api },
    );
  }
}
