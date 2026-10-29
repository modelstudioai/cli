// Workspace scope shared by every command whose API lives on a per-workspace
// host (knowledge admin plane, knowledge search/chat, memory). The console
// credential scope does not apply to these, so the workspace is a per-command
// flag instead.
import {
  BailianError,
  ExitCode,
  unwrapResponse,
  type Client,
  type CommandContext,
  type FlagsDef,
  type Settings,
} from "bailian-cli-core";

export const WORKSPACE_FLAG = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID for API endpoint URL (or set BAILIAN_WORKSPACE_ID)",
      "zh-CN": "API Endpoint URL 使用的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
    },
  },
} satisfies FlagsDef;

/** Three-level fallback: flag > BAILIAN_WORKSPACE_ID env > config (env/config are merged into settings); missing → USAGE. */
export function resolveWorkspaceId(ctx: {
  flags: { workspaceId?: string };
  settings: { workspaceId?: string };
  identity: { binName: string };
}): string {
  const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
  if (!workspaceId) {
    throw new BailianError(
      "Workspace ID is required.",
      ExitCode.USAGE,
      `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${ctx.identity.binName} config set workspace_id <id>`,
    );
  }
  return workspaceId;
}

export const LIST_WORKSPACES_API = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";

export interface ConsoleWorkspaceInfo {
  workspaceId: string;
  agentName: string;
  defaultAgent: boolean;
  tenantId?: unknown;
}

/** 复用 workspace list 的只读接口；保留用于查询身份映射的 tenantId。 */
export async function listConsoleWorkspaces(client: Client): Promise<ConsoleWorkspaceInfo[]> {
  const result = await client.console<Record<string, unknown>>(LIST_WORKSPACES_API, {});
  const response = unwrapResponse(result);
  const workspaces = Array.isArray(response) ? response : response.data;
  return Array.isArray(workspaces)
    ? workspaces.filter((workspace) => workspace && typeof workspace === "object")
    : [];
}

/** workspaceId 是资源标识，tenantId 是同一空间的 Console switchAgent；只覆盖本次请求。 */
export async function resolveConsoleWorkspaceAgent(
  ctx: Pick<CommandContext, "client" | "settings" | "localize">,
): Promise<number | undefined> {
  const workspaceId = ctx.settings.workspaceId;
  if (!workspaceId) return undefined;
  const workspaces = await listConsoleWorkspaces(ctx.client);
  const matches = workspaces.filter((workspace) => workspace.workspaceId === workspaceId);
  if (matches.length !== 1) {
    throw new BailianError(
      ctx.localize({
        "en-US":
          "Cannot uniquely resolve the requested workspace from the accessible workspace list.",
        "zh-CN": "无法从可访问的工作空间列表中唯一解析请求的工作空间。",
      }),
      ExitCode.GENERAL,
      ctx.localize({
        "en-US":
          "Check --workspace-id and access permissions in the selected console region/site. No business request was sent.",
        "zh-CN": "请核对 --workspace-id 及所选控制台地域/站点的访问权限。未发送业务请求。",
      }),
    );
  }
  const tenantId = matches[0].tenantId;
  const switchAgent =
    typeof tenantId === "number"
      ? tenantId
      : typeof tenantId === "string" && /^\d+$/.test(tenantId)
        ? Number(tenantId)
        : NaN;
  if (!Number.isSafeInteger(switchAgent) || switchAgent <= 0) {
    throw new BailianError(
      ctx.localize({
        "en-US": "The requested workspace has no valid tenantId for its query identity.",
        "zh-CN": "请求的工作空间未返回有效的 tenantId，无法确定查询身份。",
      }),
      ExitCode.GENERAL,
      ctx.localize({
        "en-US":
          "Check the workspace list response. No business request was sent and the default identity was not used.",
        "zh-CN": "请检查工作空间列表响应。未发送业务请求，也未回退使用默认身份。",
      }),
    );
  }
  return switchAgent;
}

/** dry-run 仅展示解析计划，不联网，也不把配置中的旧身份当成解析结果。 */
export function consoleWorkspaceIdentityPreview(settings: Pick<Settings, "workspaceId">) {
  return settings.workspaceId
    ? {
        workspaceIdentity: {
          api: LIST_WORKSPACES_API,
          workspaceId: settings.workspaceId,
          switchAgentFrom: "tenantId",
        },
      }
    : {};
}
