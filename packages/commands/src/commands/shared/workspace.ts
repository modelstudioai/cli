// Workspace scope shared by every command whose API lives on a per-workspace
// host (knowledge admin plane, knowledge search/chat, memory). The console
// credential scope does not apply to these, so the workspace is a per-command
// flag instead.
import {
  formatCommand,
  BailianError,
  ExitCode,
  unwrapConsoleResponse,
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
      `Pass --workspace-id, set BAILIAN_WORKSPACE_ID env, or configure: ${formatCommand(ctx.identity, "config set workspace_id <id>")}`,
    );
  }
  return workspaceId;
}

export const LIST_WORKSPACES_API = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";

/**
 * Paginated workspace list. The plain listWorkspaces zelda service has no
 * pagination inputs (the console frontend pages via the BailianControl POP
 * layer, which the CLI gateway does not expose), while listMyWorkSpaces
 * accepts reqDTO.pageNo/pageSize and returns { list, total }.
 */
export const LIST_MY_WORKSPACES_API = "zeldaEasy.bailian-dash-workspace.space.listMyWorkSpaces";

export const WORKSPACE_LIST_PAGE_SIZE = 100;
/** Hard stop so a server that ignores pageNo/total cannot loop forever. */
export const MAX_WORKSPACE_LIST_PAGES = 100;

/** listMyWorkSpaces contract: pagination lives inside reqDTO. */
export function workspaceListRequest(pageNo: number): Record<string, unknown> {
  return { reqDTO: { pageNo, pageSize: WORKSPACE_LIST_PAGE_SIZE } };
}

export interface ConsoleWorkspaceInfo {
  workspaceId: string;
  agentName: string;
  defaultAgent: boolean;
  tenantId?: unknown;
}

function workspaceTotalCount(value: unknown): number | undefined {
  const total = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

function workspaceRows(value: unknown): ConsoleWorkspaceInfo[] {
  return Array.isArray(value)
    ? value.filter((workspace) => workspace && typeof workspace === "object")
    : [];
}

/** Legacy single-page read; kept as a fallback when listMyWorkSpaces is unavailable. */
async function listConsoleWorkspacesLegacy(client: Client): Promise<ConsoleWorkspaceInfo[]> {
  const result = await client.console<Record<string, unknown>>(LIST_WORKSPACES_API, {});
  const response = unwrapConsoleResponse(result);
  const pageItems = Array.isArray(response)
    ? response
    : response && typeof response === "object" && "data" in response
      ? response.data
      : undefined;
  return workspaceRows(pageItems);
}

/** 复用 workspace list 的只读接口；按 total 翻页取全量，保留用于查询身份映射的 tenantId。 */
export async function listConsoleWorkspaces(client: Client): Promise<ConsoleWorkspaceInfo[]> {
  const collected: ConsoleWorkspaceInfo[] = [];
  let pageNo = 1;
  for (let page = 0; page < MAX_WORKSPACE_LIST_PAGES; page++) {
    const result = await client.console<Record<string, unknown>>(
      LIST_MY_WORKSPACES_API,
      workspaceListRequest(pageNo),
    );
    const response = unwrapConsoleResponse(result);
    const record =
      response && typeof response === "object" && !Array.isArray(response)
        ? (response as Record<string, unknown>)
        : undefined;
    if (!Array.isArray(record?.list)) {
      // Unrecognized shape (e.g. an older gateway): fall back to the legacy
      // single-page read rather than guessing. Server errors still propagate.
      return await listConsoleWorkspacesLegacy(client);
    }
    const workspaces = workspaceRows(record.list);
    // Keep duplicates: identity resolution must still reject ambiguous mappings.
    collected.push(...workspaces);
    const total = workspaceTotalCount(record.total);
    // An empty page stops early even if total claims more rows.
    if (workspaces.length === 0) return collected;
    if (total === undefined) return await listConsoleWorkspacesLegacy(client);
    if (collected.length >= total) return collected;
    pageNo += 1;
  }
  throw new BailianError(
    "Workspace list pagination did not reach total. / 工作空间列表分页未达到 total。",
    ExitCode.GENERAL,
    "Retry the command; use --verbose to inspect the workspace list responses.",
  );
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
          api: LIST_MY_WORKSPACES_API,
          workspaceId: settings.workspaceId,
          switchAgentFrom: "tenantId",
        },
      }
    : {};
}
