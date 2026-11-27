import {
  BailianError,
  ExitCode,
  mcpBaseUrl,
  mcpServersPath,
  type ClientRequestOpts,
  type CommandContext,
} from "bailian-cli-core";

export type McpRequestContext = Pick<CommandContext, "client" | "localize" | "settings"> & {
  flags: { workspaceId?: string };
};

// The gateway can omit pricing. Project only public, structured billing values.
function publicBilling(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  function amount(input: unknown) {
    return typeof input === "string" || (typeof input === "number" && Number.isFinite(input))
      ? input
      : null;
  }
  const billing = {
    mode: typeof raw.mode === "string" ? raw.mode : null,
    unit_price: amount(raw.unit_price ?? raw.unitPrice),
    free_quota: amount(raw.free_quota ?? raw.freeQuota),
    currency: typeof raw.currency === "string" ? raw.currency : null,
    unit: typeof raw.unit === "string" ? raw.unit : null,
  };
  return Object.values(billing).some((field) => field !== null) ? billing : null;
}
export type ServerBilling = ReturnType<typeof publicBilling>;

interface ServerMetadata {
  billing?: unknown;
  provider?: string | null;
  icon?: string | null;
  is_onekey?: boolean;
  isOnekey?: boolean;
  console_detail_url?: string;
  consoleDetailURL?: string;
}

export interface ServerDto {
  billing?: unknown;
  mcp_code?: string;
  mcpCode?: string;
  server_name?: string;
  serverName?: string;
  description?: string;
  type?: string;
  server_type?: string;
  serverType?: string;
  server_status?: string;
  serverStatus?: string;
  server_status_text?: string;
  serverStatusText?: string;
  dashscope_endpoint?: string;
  dashscopeEndpoint?: string;
  meta_info?: ServerMetadata;
  metaInfo?: ServerMetadata;
  activate_fail_reason?: string;
  activateFailReason?: string;
  requires_manual_setup?: boolean;
  requiresManualSetup?: boolean;
}

export async function requestMcpData<Data>(ctx: McpRequestContext, options: ClientRequestOpts) {
  const path = ctx.client.url(options.path, () => {
    const workspaceId = ctx.flags.workspaceId ?? ctx.settings.workspaceId;
    if (workspaceId) return mcpBaseUrl(workspaceId);
    throw new BailianError(
      ctx.localize({
        "en-US":
          "Set workspace_id or BAILIAN_WORKSPACE_ID, pass --workspace-id, or provide --base-url to access the MCP API.",
        "zh-CN":
          "访问 MCP API 需要配置 workspace_id、设置 BAILIAN_WORKSPACE_ID，或传入 --workspace-id、--base-url。",
      }),
      ExitCode.USAGE,
    );
  });
  const response = await ctx.client.requestJson<{
    success: boolean;
    data?: Data;
    request_id?: string;
    requestId?: string;
  }>({ ...options, path });
  const requestId = response?.request_id ?? response?.requestId;
  if (response?.success !== true || response.data == null) {
    throw new BailianError(
      ctx.localize({
        "en-US": "The MCP response is missing successful result data.",
        "zh-CN": "MCP 响应缺少成功结果数据。",
      }),
      ExitCode.GENERAL,
      undefined,
      { api: { requestId } },
    );
  }
  return { data: response.data, requestId };
}

// Whitelist public fields. The detail DTO also carries saved credentials in mcp_config.
export function publicServer(
  ctx: McpRequestContext,
  data: ServerDto,
  requestId?: string,
  expectedCode?: string,
) {
  const code = data?.mcp_code ?? data?.mcpCode;
  if (
    typeof code !== "string" ||
    !code.trim() ||
    (expectedCode !== undefined && code !== expectedCode)
  ) {
    throw new BailianError(
      ctx.localize({
        "en-US": "The MCP response did not confirm the requested server.",
        "zh-CN": "MCP 响应未确认目标服务。",
      }),
      ExitCode.GENERAL,
      undefined,
      { api: { requestId } },
    );
  }
  const meta = data.meta_info ?? data.metaInfo;
  const status = data.server_status ?? data.serverStatus ?? null;
  return {
    server_code: code,
    server_name: data.server_name ?? data.serverName ?? null,
    description: data.description ?? null,
    type: data.type ?? null,
    server_type: data.server_type ?? data.serverType ?? null,
    server_status: status,
    server_status_text: data.server_status_text ?? data.serverStatusText ?? null,
    activated: status === "ACTIVATED",
    provider: meta?.provider ?? null,
    icon: meta?.icon ?? null,
    is_onekey: meta?.is_onekey ?? meta?.isOnekey ?? null,
    endpoint: data.dashscope_endpoint ?? data.dashscopeEndpoint ?? null,
    console_url: meta?.console_detail_url ?? meta?.consoleDetailURL ?? null,
  };
}

export async function requestMcpServer(
  ctx: McpRequestContext,
  method: "GET" | "POST" | "DELETE",
  server?: string,
  body?: unknown,
) {
  const { data, requestId } = await requestMcpData<ServerDto>(ctx, {
    method,
    path: mcpServersPath(server),
    body,
  });
  const detail = {
    ...publicServer(ctx, data, requestId, server),
    billing: publicBilling(data.billing ?? (data.meta_info ?? data.metaInfo)?.billing),
  };
  return {
    detail,
    requestId,
    failReason: data.activate_fail_reason ?? data.activateFailReason,
    requiresManualSetup: (data.requires_manual_setup ?? data.requiresManualSetup) === true,
  };
}
