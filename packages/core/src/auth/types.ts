/** Where a resolved credential came from (shown by `bl auth status`). */
export type CredentialSource = "flag" | "env" | "config";

/** Credential for the **model domain** (DashScope data plane). Always an API key. */
export interface ApiKeyCredential {
  token: string;
  /** Base URL to send this key's requests to. */
  baseUrl: string;
  source: CredentialSource;
}

/** Credential for the **console domain** (Bailian console gateway). An access token + region/site. */
export interface ConsoleCredential {
  token: string;
  region: string;
  site: "domestic" | "international";
  switchAgent?: number;
  source: CredentialSource;
}

/** Full auth snapshot for display (`bl auth status`) — what would resolve per domain. */
export interface AuthState {
  apiKey?: ApiKeyCredential;
  console?: ConsoleCredential;
}
