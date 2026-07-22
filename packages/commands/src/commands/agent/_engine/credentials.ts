import { bootstrapRuntimeCredentialsSync } from "@openagentpack/sdk";
import { readConfigFile } from "bailian-cli-core";

let bootstrapped = false;

/**
 * Shared `--help` note documenting where agent commands get provider
 * credentials. Mirrors the credential-source hint bl's native commands surface
 * (knowledge / usage / token-plan), adapted for the SDK's env-based resolution
 * and the {@link bridgeBailianCredentials} fallback. Attach to every command
 * that loads agents.yaml. `bl` prefix is safe: agent commands ship on `bl` only.
 */
export const CREDENTIALS_NOTE = [
  "Credentials come from the env vars referenced in agents.yaml (e.g. ${DASHSCOPE_API_KEY}, ${BAILIAN_BASE_URL}).",
  "For the bailian provider, bl fills these from your login as a fallback: `bl auth login --api-key <key> --agentstudio-base-url <url>`.",
];

/**
 * Bridge bl's own login state into the env vars the OpenAgentPack SDK reads for
 * the bailian provider. bl persists `api_key` / `agentstudio_base_url` in
 * `~/.bailian/config.json` (via `bl auth login`); mirror them onto
 * `DASHSCOPE_API_KEY` / `BAILIAN_BASE_URL` so users don't have to re-declare the
 * same credentials for `bl agent *`. `workspace_id` is still bridged for configs
 * that predate the base_url flow (the SDK accepts either).
 *
 * Lowest priority: only fills a var that is still unset, so anything already in
 * the environment (shell export, `.env`, or `~/.agents/config.json` — which the
 * SDK bootstrap has already applied) wins. Missing values are left alone; the
 * SDK surfaces its own error when interpolation can't resolve, and non-bailian
 * providers (claude/qoder/ark) don't need DashScope credentials at all.
 */
export function bridgeBailianCredentials(): void {
  const file = readConfigFile();
  if (!process.env.DASHSCOPE_API_KEY?.trim() && file.api_key) {
    process.env.DASHSCOPE_API_KEY = file.api_key;
  }
  if (!process.env.BAILIAN_BASE_URL?.trim() && file.agentstudio_base_url) {
    process.env.BAILIAN_BASE_URL = file.agentstudio_base_url;
  }
  if (!process.env.BAILIAN_WORKSPACE_ID?.trim() && file.workspace_id) {
    process.env.BAILIAN_WORKSPACE_ID = file.workspace_id;
  }
}

/**
 * Lazily load `.env` and `~/.agents/config.json` into `process.env` so the
 * OpenAgentPack SDK can resolve provider credentials (e.g. DASHSCOPE_API_KEY,
 * BAILIAN_WORKSPACE_ID), then bridge bl's own config as a fallback. Safe to call
 * repeatedly — only the first call does I/O.
 *
 * Effective precedence for bailian provider fields:
 *   ~/.agents/config.json > shell env > .env > ~/.bailian/config.json
 *
 * NOTE: agent commands declare `auth: "none"` and let the SDK own credential
 * resolution. The bl-config bridge is a best-effort fallback; it never overrides
 * a value the SDK bootstrap already resolved.
 */
export function ensureCredentials(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  bootstrapRuntimeCredentialsSync();
  bridgeBailianCredentials();
}
