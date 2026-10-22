import { createManagedApiContext, resolveBailianApiBaseUrl, UserError } from "@openagentpack/sdk";
import { BailianError, type Client, ExitCode } from "bailian-cli-core";
import { type HostContext, installSdkTransport } from "./transport.ts";

export interface ManagedApiHost extends HostContext {
  client: Client;
  flags: { workspaceId?: string };
}

/** Resolve the CLI connection without loading project files or credentials. */
export function resolveManagedApiBaseUrl(host: ManagedApiHost): string {
  const configuredBaseUrl = host.client.url("", () => "") || undefined;
  const workspaceId = host.flags.workspaceId ?? host.settings.workspaceId;
  if (!configuredBaseUrl && !workspaceId?.trim()) {
    throw new BailianError(
      "Workspace ID is required when no base URL is configured. / 未配置 Base URL 时必须提供 Workspace ID。",
      ExitCode.USAGE,
      "Pass --workspace-id, set BAILIAN_WORKSPACE_ID, configure workspace_id, or set --base-url. / 请传入 --workspace-id、设置 BAILIAN_WORKSPACE_ID 或 workspace_id 配置，或通过 --base-url 指定地址。",
    );
  }
  try {
    return resolveBailianApiBaseUrl({ baseUrl: configuredBaseUrl, workspaceId });
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    throw new BailianError(
      configuredBaseUrl
        ? "The configured API base URL is invalid. / 配置的 API Base URL 无效。"
        : "Workspace ID must be a valid hostname label. / Workspace ID 必须是有效的主机名标签。",
      ExitCode.USAGE,
      configuredBaseUrl
        ? "Configure a valid HTTP or HTTPS API base URL. / 请配置有效的 HTTP 或 HTTPS API Base URL。"
        : "Use a workspace ID such as workspace-example, or set --base-url. / 请使用 workspace-example 这样的有效 Workspace ID，或设置 --base-url。",
    );
  }
}

/** Delegate the authStage-resolved credential to the SDK in memory only. */
export function buildManagedApiContext(host: ManagedApiHost) {
  const credential = host.client.exportApiCredential();
  if (!credential?.token.trim()) {
    throw new BailianError(
      "A Bailian API key is required. / 必须提供百炼 API Key。",
      ExitCode.AUTH,
      "Pass --api-key, set DASHSCOPE_API_KEY, or log in with auth login --api-key <key>. / 请传入 --api-key、设置 DASHSCOPE_API_KEY，或使用 auth login --api-key <key> 登录。",
    );
  }
  const baseUrl = resolveManagedApiBaseUrl(host);
  installSdkTransport(host);
  return createManagedApiContext({
    providers: {
      bailian: {
        api_key: credential.token,
        base_url: baseUrl,
        workspace_id: host.flags.workspaceId ?? host.settings.workspaceId,
      },
    },
  });
}
