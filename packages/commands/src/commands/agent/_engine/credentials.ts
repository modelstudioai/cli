import { bootstrapRuntimeCredentialsSync } from "@openagentpack/sdk";

let bootstrapped = false;

/**
 * Lazily load `.env` and `~/.agents/config.json` into `process.env` so the
 * OpenAgentPack SDK can resolve provider credentials (e.g. DASHSCOPE_API_KEY,
 * BAILIAN_WORKSPACE_ID). Safe to call repeatedly — only the first call does I/O.
 *
 * NOTE: agent commands declare `auth: "none"` and let the SDK own credential
 * resolution. This is the documented tradeoff of the wholesale SDK integration;
 * bl's own `--api-key` / `bl auth login` flow is bridged separately as a follow-up.
 */
export function ensureCredentials(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  bootstrapRuntimeCredentialsSync();
}
