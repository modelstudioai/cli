import {
  maskToken,
  type AuthStore,
  type CommandOutput,
  type Identity,
  type LocalizedText,
  type Settings,
} from "bailian-cli-core";
import { runConsoleLogin, resolveConsoleOrigin } from "./login-console.ts";

/** Read-only auth snapshot the config UI account widget renders. bl stores no
 * user profile (name/avatar), so this exposes only which credential domains
 * resolve, the console region/site, and a masked token. */
export interface AuthUiStatus {
  authenticated: boolean;
  methods: { apiKey: boolean; console: boolean; openapi: boolean };
  primary: "console" | "apiKey" | "openapi" | null;
  environment?: "pre";
  region?: string;
  site?: "domestic" | "international";
  masked?: string;
}

/**
 * The auth capability surface the config UI is allowed to use. All `authStore`
 * access is kept inside this module (commands/auth/**), which the lint boundary
 * permits; commands/config/** consumes only this opaque bridge and never
 * touches `authStore` directly.
 */
export interface AuthUiBridge {
  status(): AuthUiStatus;
  /** Start browser-based console login (fire-and-forget; UI polls status). */
  startConsoleLogin(): void;
  /** Log out of the bound profile; pre-release leaves model credentials intact. */
  logout(): Promise<boolean>;
}

/** Build the bridge from a command context (identity/settings/authStore). */
export function makeAuthUiBridge(ctx: {
  identity: Identity;
  settings: Settings;
  authStore: AuthStore;
  output: Pick<CommandOutput, "info" | "warning" | "debug">;
  localize?: (text: LocalizedText) => string;
}): AuthUiBridge {
  const { identity, settings, authStore, localize, output } = ctx;
  const pre = settings.preControlPlane !== undefined;
  const warnLoginFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    output.warning({
      message: {
        "en-US": `Console login failed: ${message}`,
        "zh-CN": `控制台登录失败：${message}`,
      },
      code: "CONSOLE_LOGIN_FAILED",
    });
  };
  return {
    status() {
      const a = authStore.describe();
      const methods = {
        apiKey: !!a.apiKey,
        console: !!(a.console || a.aliyunOAuth?.console_enabled),
        openapi: !!(a.openapi || a.aliyunOAuth?.openapi_enabled),
      };
      let masked: string | undefined;
      if (a.console) masked = maskToken(a.console.token);
      else if (a.apiKey) masked = maskToken(a.apiKey.token);
      else if (a.openapi) masked = maskToken(a.openapi.accessKeyId);
      const primary = methods.console
        ? "console"
        : methods.apiKey
          ? "apiKey"
          : methods.openapi
            ? "openapi"
            : null;
      return {
        authenticated: methods.apiKey || methods.console || methods.openapi,
        methods,
        primary,
        ...(pre ? { environment: "pre" as const } : {}),
        region:
          a.console?.region ??
          (a.aliyunOAuth?.console_enabled ? a.aliyunOAuth.console_region : undefined),
        site: a.console?.site ?? (a.aliyunOAuth?.console_enabled ? "domestic" : undefined),
        masked,
      };
    },
    startConsoleLogin() {
      const origin = pre ? undefined : resolveConsoleOrigin(authStore.describe().console?.site);
      // Keep launch Profile and environment bound for the entire callback. The UI only polls for completion.
      try {
        void runConsoleLogin(
          origin,
          { identity, settings, authStore, localize, output },
          {
            needApiKey: !pre && !authStore.stored().apiKey,
          },
        ).catch(warnLoginFailure);
      } catch (error) {
        // Endpoint preflight failures are synchronous; never tell the UI login was started.
        warnLoginFailure(error);
        throw error;
      }
    },
    logout() {
      return authStore.logout("all");
    },
  };
}
