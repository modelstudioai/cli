import { maskToken, type AuthStore, type Identity, type Settings } from "bailian-cli-core";
import { runConsoleLogin, resolveConsoleOrigin } from "./login-console.ts";

/** Read-only auth snapshot the config UI account widget renders. bl stores no
 * user profile (name/avatar), so this exposes only which credential domains
 * resolve, the console region/site, and a masked token. */
export interface AuthUiStatus {
  authenticated: boolean;
  methods: { apiKey: boolean; console: boolean; openapi: boolean };
  primary: "console" | "apiKey" | "openapi" | null;
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
  /** Clear all stored credentials. Returns whether anything changed. */
  logout(): Promise<boolean>;
}

/** Build the bridge from a command context (identity/settings/authStore). */
export function makeAuthUiBridge(ctx: {
  identity: Identity;
  settings: Settings;
  authStore: AuthStore;
}): AuthUiBridge {
  const { identity, settings, authStore } = ctx;
  return {
    status() {
      const a = authStore.describe();
      const methods = { apiKey: !!a.apiKey, console: !!a.console, openapi: !!a.openapi };
      let masked: string | undefined;
      if (a.console) masked = maskToken(a.console.token);
      else if (a.apiKey) masked = maskToken(a.apiKey.token);
      else if (a.openapi) masked = maskToken(a.openapi.accessKeyId);
      const primary = a.console ? "console" : a.apiKey ? "apiKey" : a.openapi ? "openapi" : null;
      return {
        authenticated: methods.apiKey || methods.console || methods.openapi,
        methods,
        primary,
        region: a.console?.region,
        site: a.console?.site,
        masked,
      };
    },
    startConsoleLogin() {
      const origin = resolveConsoleOrigin(authStore.describe().console?.site);
      // Mirror the CLI (`bl auth login --console`): request an api_key from the
      // console only when one isn't already stored, so a first console login in
      // the config UI also provisions the model api_key (not just access_token).
      const hasApiKey = !!authStore.stored().apiKey;
      // runConsoleLogin opens the browser and runs its own callback server
      // (up to 15 min). We don't await it — the config UI polls the status
      // endpoint to detect completion. Errors are logged, not surfaced.
      void runConsoleLogin(
        origin,
        { identity, settings, authStore },
        {
          needApiKey: !hasApiKey,
        },
      ).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`console login failed: ${msg}\n`);
      });
    },
    logout() {
      return authStore.logout("all");
    },
  };
}
