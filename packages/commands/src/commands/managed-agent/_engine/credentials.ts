import { AGENTS_PROVIDER_FIELDS, bootstrapRuntimeCredentialsSync } from "@openagentpack/sdk";
import { BailianError, type Client, ExitCode, type Settings } from "bailian-cli-core";

/**
 * AgentStudio API path the SDK's BailianClient serves resources under. bl's
 * `base_url` is the bare model-service origin (e.g. https://dashscope.aliyuncs.com);
 * the SDK appends resource paths onto the bailian provider's `base_url` verbatim,
 * so the agent path must carry this suffix. See OpenAgentPack BailianClient.
 */
const AGENTSTUDIO_API_PATH = "/api/v1/agentstudio";

/**
 * Every env var the SDK recognizes as provider credential material (primary keys
 * from the SDK's own field map) plus bl-side interpolation aliases and bailian's
 * endpoint var (not part of AGENTS_PROVIDER_FIELDS). These are the only vars the
 * pipeline placeholders (to keep interpolation from throwing) and scrubs (so no
 * real credential persists in the environment).
 */
const CREDENTIAL_ENV_KEYS = [
  ...new Set([
    ...Object.values(AGENTS_PROVIDER_FIELDS).flatMap((fields) => fields.map((field) => field.key)),
    "BAILIAN_API_KEY",
    "BAILIAN_BASE_URL",
    "CLAUDE_API_KEY",
    "QODER_API_KEY",
  ]),
];

/** How to obtain each provider's key, surfaced in the CLI's own AUTH error when it is missing. */
const CREDENTIAL_HINTS: Record<string, string> = {
  bailian: "Run `bl auth login --api-key <key>`, pass --api-key, or set DASHSCOPE_API_KEY.",
  claude: "Set ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in your shell or .env.",
  ark: "Set ARK_API_KEY in your shell or .env.",
  qoder: "Set QODER_PAT (or QODER_API_KEY) in your shell or .env.",
};

/** The slice of CommandContext the credential pipeline needs: authStage-resolved client + settings. */
export interface CredentialHost {
  client: Client;
  settings: Settings;
}

/**
 * Shared `--help` note documenting where agent commands get provider
 * credentials. Bailian goes through bl's own auth chain (commands declare
 * `auth: "apiKey"`); other providers come from env. Either way the resolved
 * credential is injected into the SDK in-memory and scrubbed from the
 * environment. Attach to every command that loads agents.yaml. `bl` prefix is
 * safe: agent commands ship on `bl` only.
 */
export const CREDENTIALS_NOTE = [
  "Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).",
  "Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.",
  "Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.",
];

/**
 * Load the SDK's env-based credential sources (`.env`, `~/.agents/config.json`)
 * for non-bailian providers, then placeholder every credential var that is still
 * unset with "" so agents.yaml `${VAR}` interpolation never throws on a value the
 * pipeline is about to supply (bailian) or authoritatively reject ({@link
 * assertProviderCredentials}). Runs every call (no I/O cache) so a scrubbed
 * environment is repopulated if the same process resolves more than one config.
 */
export function prepareProviderEnv(): void {
  bootstrapRuntimeCredentialsSync();
  for (const key of CREDENTIAL_ENV_KEYS) {
    if (process.env[key] === undefined) process.env[key] = "";
  }
}

/**
 * Override the bailian provider block with bl's authStage-resolved credential, so
 * the bailian API key is authoritatively the CLI auth chain's — never a config
 * file bare-read or a stale env value. `api_key` is replaced unconditionally;
 * `base_url` / `workspace_id` are filled only when the block references them and
 * the interpolated value is empty (a literal in agents.yaml is respected).
 *
 * `base_url` carries {@link AGENTSTUDIO_API_PATH} because the SDK appends resource
 * paths onto it verbatim; a value already ending in the suffix is left as-is.
 * With no credential (only under --dry-run: authStage hard-gates otherwise) the
 * bailian block is left untouched. Non-bailian blocks keep their interpolated
 * (env-sourced) values.
 */
export function injectProviderCredentials(
  providers: Record<string, unknown>,
  host: CredentialHost,
): void {
  const bailian = providers.bailian;
  if (!bailian || typeof bailian !== "object") return;
  const block = bailian as Record<string, unknown>;

  const cred = host.client.exportApiCredential();
  if (cred) {
    block.api_key = cred.token;
    if ("base_url" in block && !block.base_url) {
      block.base_url = cred.baseUrl.endsWith(AGENTSTUDIO_API_PATH)
        ? cred.baseUrl
        : `${cred.baseUrl}${AGENTSTUDIO_API_PATH}`;
    }
  }
  if ("workspace_id" in block && !block.workspace_id && host.settings.workspaceId) {
    block.workspace_id = host.settings.workspaceId;
  }
}

/**
 * Remove every credential var from `process.env` after interpolation has run and
 * bailian has been overridden in-memory. From here on the real credentials live
 * only in the config object (and, after `createProjectRuntime`, in each provider
 * adapter instance) — nothing persists in the environment for the process
 * lifetime or any child process.
 */
export function scrubCredentialEnv(): void {
  for (const key of CREDENTIAL_ENV_KEYS) {
    delete process.env[key];
  }
}

/**
 * After injection, fail with a CLI-authoritative AUTH error if any configured
 * provider's `api_key` resolved empty (missing env var, or no bl login for
 * bailian). Replaces the SDK's raw `Environment variable '...' is not set` /
 * zod config error with a clean message plus a provider-specific hint. Validates
 * every declared provider, so a project is only runnable once all its providers'
 * keys are available.
 */
export function assertProviderCredentials(providers: Record<string, unknown>): void {
  for (const [name, raw] of Object.entries(providers)) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    if (!("api_key" in block)) continue;
    const apiKey = block.api_key;
    if (typeof apiKey === "string" && apiKey.trim()) continue;
    throw new BailianError(
      `Provider '${name}' is configured but its API key is empty.`,
      ExitCode.AUTH,
      CREDENTIAL_HINTS[name] ?? `Provide credentials for provider '${name}'.`,
    );
  }
}
