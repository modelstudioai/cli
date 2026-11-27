import { normalizeOAuthUrl } from "../auth/aliyun-config.ts";
import type { AliyunOAuthProfile } from "../auth/aliyun-types.ts";
import { UsageError } from "../errors/base.ts";

export const PRE_ALIYUN_AUTHORIZATION_URL = "https://signin.aliyun.com/oauth2/v1/auth";
export const PRE_ALIYUN_OAUTH_BASE_URL = "https://pre-oauth-cn-shanghai.aliyun.com";
export const PRE_MODEL_STUDIO_HOST = "modelstudio-pre.aliyuncs.com";
export const PRE_BAILIAN_CONTROL_HOST = "bailiancontrol-pre.aliyuncs.com";

const PRE_CONSOLE_ORIGIN = "https://pre-bailian.console.aliyun.com";
const PRE_CONSOLE_GATEWAY = "https://pre-bailian-cs.console.aliyun.com";

export interface PreControlPlane {
  consoleOrigin?: string;
  consoleGateway?: string;
}

export function resolvePreControlPlane(env: NodeJS.ProcessEnv): PreControlPlane | undefined {
  const value = env.BAILIAN_PRE?.trim().toLowerCase();
  if (!value || value === "0" || value === "false") return undefined;
  if (value !== "1" && value !== "true") {
    throw new UsageError(
      "Use 1, true, 0 or false for BAILIAN_PRE. / BAILIAN_PRE 仅接受 1、true、0 或 false。",
    );
  }
  const consoleOrigin = env.BAILIAN_PRE_CONSOLE_ORIGIN?.trim();
  const consoleGateway = env.BAILIAN_PRE_CONSOLE_GATEWAY?.trim();
  const settings = {
    ...(consoleOrigin ? { consoleOrigin: normalizeOAuthUrl(consoleOrigin, true) } : {}),
    ...(consoleGateway ? { consoleGateway: normalizeOAuthUrl(consoleGateway, true) } : {}),
  };
  if (settings.consoleOrigin) requirePreConsoleOrigin(settings, {});
  if (settings.consoleGateway) requirePreConsoleGateway(settings, {});
  return settings;
}

export function validatePreConsoleScope(target: { region?: string; site?: string }): void {
  if (
    (target.region !== undefined && target.region !== "cn-beijing") ||
    (target.site !== undefined && target.site !== "domestic")
  ) {
    throw new UsageError(
      "The pre-release control plane supports only the domestic cn-beijing site. / 预发控制面当前仅支持国内站 cn-beijing。",
    );
  }
}

export function requirePreConsoleOrigin(
  pre: PreControlPlane,
  target: { region?: string; site?: string },
): string {
  validatePreConsoleScope(target);
  if (pre.consoleOrigin !== PRE_CONSOLE_ORIGIN) {
    throw new UsageError(
      "Set BAILIAN_PRE_CONSOLE_ORIGIN to the confirmed domestic pre-release Console login origin. / 请将 BAILIAN_PRE_CONSOLE_ORIGIN 设为已确认的国内预发控制台登录源站。",
    );
  }
  return pre.consoleOrigin;
}

export function requirePreConsoleGateway(
  pre: PreControlPlane,
  target: { region?: string; site?: string },
): string {
  validatePreConsoleScope(target);
  if (pre.consoleGateway !== PRE_CONSOLE_GATEWAY) {
    throw new UsageError(
      "Set BAILIAN_PRE_CONSOLE_GATEWAY to the confirmed domestic pre-release CLI gateway. / 请将 BAILIAN_PRE_CONSOLE_GATEWAY 设为已确认的国内预发 CLI 网关。",
    );
  }
  return pre.consoleGateway;
}

export function resolvePreOpenApiHost(host: string): string {
  switch (host) {
    case "modelstudio.aliyuncs.com":
    case "modelstudio.cn-beijing.aliyuncs.com":
    case PRE_MODEL_STUDIO_HOST:
      return PRE_MODEL_STUDIO_HOST;
    case "bailiancontrol.aliyuncs.com":
    case "bailiancontrol.cn-beijing.aliyuncs.com":
    case PRE_BAILIAN_CONTROL_HOST:
      return PRE_BAILIAN_CONTROL_HOST;
    default:
      throw new UsageError(
        "This OpenAPI endpoint is not available in the pre-release control plane. / 此 OpenAPI 端点在预发控制面不可用。",
      );
  }
}

export function validatePreAliyunProfile(profile: Omit<AliyunOAuthProfile, "session_ref">): void {
  validatePreConsoleScope({ region: profile.console_region });
  if (
    profile.authorization_url !== PRE_ALIYUN_AUTHORIZATION_URL ||
    profile.oauth_base_url !== PRE_ALIYUN_OAUTH_BASE_URL ||
    profile.modelstudio_host !== PRE_MODEL_STUDIO_HOST ||
    (profile.bailiancontrol_host !== undefined &&
      profile.bailiancontrol_host !== PRE_BAILIAN_CONTROL_HOST) ||
    profile.console_gateway !== PRE_CONSOLE_GATEWAY
  ) {
    throw new UsageError(
      "Aliyun OAuth profile endpoints do not match the pre-release control plane. / 阿里云 OAuth 配置端点与预发控制面不匹配。",
    );
  }
}
