import {
  BailianError,
  ExitCode,
  formatCommand,
  mcpServersPath,
  type CommandContext,
  type LocalizedText,
} from "bailian-cli-core";
import { mcpMarketplaceDetailPage, normalizeError } from "bailian-cli-runtime";
import { openInBrowser } from "../shared/local-server.ts";
import { serverFlag, validateServer } from "./server-management.ts";
import {
  publicServer,
  requestMcpData,
  requestMcpServer,
  type McpRequestContext,
  type ServerDto,
  type ServerBilling,
} from "./server-response.ts";

export const batchServerFlag = {
  ...serverFlag,
  valueHint: "<code,...>",
  description: {
    "en-US": "Comma-separated server codes (up to 30 distinct servers)",
    "zh-CN": "逗号分隔的服务编码，去重后最多 30 个",
  },
} as const;

type Operation = "activate" | "deactivate";
type Action = Operation | "enable" | "disable";
type Context = McpRequestContext & Pick<CommandContext, "identity">;

function serverCodes(value: string) {
  return [...new Set(value.split(",").map((code) => code.trim()))];
}

export function validateServers(value: string) {
  const codes = serverCodes(value);
  for (const code of codes) {
    const error = validateServer(code);
    if (error) return error;
  }
  if (codes.length > 30)
    return {
      "en-US": "--server accepts at most 30 distinct server codes.",
      "zh-CN": "--server 去重后最多支持 30 个服务编码。",
    };
}

interface WriteStep {
  billing?: ServerBilling;
  code: string;
  action: Action;
  type: string;
  server_status: string;
  is_onekey: boolean | null;
  console_url: string | null;
}

interface ItemResult {
  billing?: ServerBilling;
  code: string;
  status: "succeeded" | "failed" | "noop";
  server_status?: string | null;
  server_status_text?: string | null;
  request_id?: string;
  reason?: string;
  error_code?: string | number;
  message?: string;
  hint?: string;
  outcome_unknown?: boolean;
  api_code?: string;
  http_status?: number;
  detail?: { console_url: string; browser_opened?: boolean };
}

interface Completed {
  result: ItemResult;
  error?: BailianError;
}

export type LifecyclePlan = (WriteStep | Completed)[];

function responseError(ctx: Context, message: LocalizedText, requestId?: string) {
  return new BailianError(ctx.localize(message), ExitCode.GENERAL, undefined, {
    api: { requestId },
  });
}

function failure(code: string, error: BailianError, fields?: Partial<ItemResult>): Completed {
  return {
    error,
    result: {
      code,
      status: "failed",
      error_code: error.api?.apiCode ?? error.exitCode,
      api_code: error.api?.apiCode,
      message: error.message,
      hint: error.hint,
      http_status: error.api?.httpStatus,
      request_id: error.api?.requestId,
      ...fields,
    },
  };
}

const marketSetupMessage = "当前云市场MCP不允许通过OpenAPI开通，请前往控制台手动开通：";

function trustedConsoleUrl(value: string | null) {
  if (!value || !URL.canParse(value)) return;
  const url = new URL(value);
  if (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    /(^|\.)console\.(aliyun|alibabacloud)\.com$/.test(url.hostname)
  )
    return url.href;
}

function manualSetup(
  code: string,
  error: BailianError,
  consoleUrl: string | null,
  billing?: ServerBilling,
): Completed {
  const marketUrl = error.message.startsWith(marketSetupMessage)
    ? error.message.slice(marketSetupMessage.length)
    : null;
  const url =
    trustedConsoleUrl(marketUrl) ??
    trustedConsoleUrl(consoleUrl) ??
    mcpMarketplaceDetailPage(encodeURIComponent(code));
  return failure(code, error, {
    error_code: "MANUAL_SETUP_REQUIRED",
    ...(billing && { billing }),
    detail: { console_url: url },
  });
}

// These activation responses explicitly require an input that can only be supplied in the console.
function requiresManualSetup(error: BailianError) {
  switch (error.api?.apiCode) {
    case "MANUAL_SETUP_REQUIRED":
      return true;
    case "InvalidParameter":
      return error.message.startsWith("缺少开通所需的环境变量：");
    case "OperationNotSupported":
      return (
        error.message === "当前MCP需要选择凭据，不支持通过OpenAPI开通，请登录百炼控制台手动开通" ||
        error.message ===
          "当前MCP需要选择Ram角色，不支持通过OpenAPI开通，请登录百炼控制台手动开通" ||
        error.message.startsWith(marketSetupMessage)
      );
    default:
      return false;
  }
}

export function planServerLifecycle(
  ctx: Context,
  code: string,
  operation: Operation,
  { detail, requestId, requiresManualSetup: manual }: Awaited<ReturnType<typeof requestMcpServer>>,
): WriteStep | Completed {
  const { type, server_status: status, is_onekey, console_url, billing } = detail;
  const price = billing ? { billing } : {};
  const activating = operation === "activate";
  if (
    (activating && (status === "ACTIVATED" || status === "ACTIVATING")) ||
    (!activating && status === "INACTIVE")
  ) {
    const reason =
      status === "ACTIVATING"
        ? "ALREADY_ACTIVATING"
        : activating
          ? "ALREADY_ACTIVATED"
          : "NOT_ACTIVATED";
    return {
      result: {
        code,
        status: "noop",
        reason,
        ...price,
        server_status: status,
        request_id: requestId,
      },
    };
  }
  if (
    (type !== "OFFICIAL" && type !== "CUSTOMER") ||
    !status ||
    !["ACTIVATED", "ACTIVATING", "INACTIVE", "ACTIVATE_FAILED"].includes(status)
  ) {
    return failure(
      code,
      responseError(
        ctx,
        {
          "en-US": "The MCP detail response did not confirm an actionable server type and status.",
          "zh-CN": "MCP 详情未返回可操作的服务类型和状态。",
        },
        requestId,
      ),
      { server_status: status, ...price },
    );
  }
  if (activating && type === "OFFICIAL" && manual) {
    return manualSetup(
      code,
      responseError(
        ctx,
        {
          "en-US": "Complete this service's configuration in the Bailian console.",
          "zh-CN": "请在百炼控制台完成此服务的配置。",
        },
        requestId,
      ),
      console_url,
      billing,
    );
  }
  const action = type === "OFFICIAL" ? operation : activating ? "enable" : "disable";
  return { code, type, action, server_status: status, is_onekey, console_url, ...price };
}

export async function prepareLifecycle(ctx: Context, servers: string, operation: Operation) {
  const data: LifecyclePlan = [];
  for (const code of serverCodes(servers)) {
    try {
      data.push(
        planServerLifecycle(ctx, code, operation, await requestMcpServer(ctx, "GET", code)),
      );
    } catch (error) {
      data.push(failure(code, normalizeError(error, formatCommand(ctx.identity), ctx.localize)));
    }
  }
  return {
    data,
    preview: { operation, targets: data.map((step) => ("result" in step ? step.result : step)) },
    risk: null,
    notices: [],
  };
}

export async function writeServer(ctx: Context, step: WriteStep): Promise<Completed> {
  const { code, action } = step;
  try {
    const { data, requestId } = await requestMcpData<ServerDto>(ctx, {
      method: "POST",
      path: `${mcpServersPath(code)}/${action}`,
    });
    const { server_status, server_status_text } = publicServer(ctx, data, requestId, code);
    const fields = {
      server_status,
      server_status_text,
      request_id: requestId,
      ...(step.billing && { billing: step.billing }),
    };
    if (server_status === "ACTIVATE_FAILED") {
      const message =
        data.activate_fail_reason ?? data.activateFailReason ?? server_status_text ?? server_status;
      return failure(
        code,
        new BailianError(message, ExitCode.GENERAL, undefined, { api: { requestId } }),
        {
          ...fields,
          error_code: server_status,
        },
      );
    }
    const activating = action === "activate" || action === "enable";
    if (
      activating
        ? server_status === "ACTIVATED" || server_status === "ACTIVATING"
        : server_status === "INACTIVE"
    ) {
      return { result: { code, status: "succeeded", ...fields } };
    }
    return failure(
      code,
      responseError(
        ctx,
        {
          "en-US": "The MCP response did not confirm the requested change.",
          "zh-CN": "MCP 响应未确认请求的状态变更。",
        },
        requestId,
      ),
      fields,
    );
  } catch (error) {
    const cause = normalizeError(error, formatCommand(ctx.identity), ctx.localize);
    if (action === "activate" && requiresManualSetup(cause))
      return manualSetup(code, cause, step.console_url, step.billing);
    if (cause.exitCode === ExitCode.TIMEOUT || cause.exitCode === ExitCode.NETWORK) {
      const hint = ctx.localize({
        "en-US": "The write outcome is unknown. Check the server status before retrying.",
        "zh-CN": "写入结果尚未确认，请先核对服务状态再决定是否重试。",
      });
      return failure(code, new BailianError(cause.message, cause.exitCode, hint, { cause }), {
        outcome_unknown: true,
      });
    }
    return failure(code, cause);
  }
}

export async function runLifecycle(
  ctx: Context & Pick<CommandContext, "output"> & { prepared?: LifecyclePlan },
  allowBrowser: boolean,
) {
  if (!ctx.prepared)
    throw new BailianError(
      ctx.localize({
        "en-US": "Missing MCP operation plan.",
        "zh-CN": "缺少 MCP 操作计划。",
      }),
    );
  const summary = { succeeded: 0, failed: 0, noop: 0 };
  const results: ItemResult[] = [];
  let firstError: BailianError | undefined;
  for (const step of ctx.prepared) {
    const { result, error } = "action" in step ? await writeServer(ctx, step) : step;
    if (
      result.detail &&
      allowBrowser &&
      process.stdin.isTTY &&
      process.stdout.isTTY &&
      ctx.settings.output === "text"
    ) {
      result.detail.browser_opened = await openInBrowser(result.detail.console_url).then(
        () => true,
        () => false,
      );
    }
    summary[result.status]++;
    results.push(result);
    firstError ??= error;
  }
  ctx.output.result({ summary, results });
  if (firstError) throw firstError;
}
