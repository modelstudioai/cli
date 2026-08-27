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
  {
    "en-US":
      "Bailian credentials come from bl's auth chain: --api-key > DASHSCOPE_API_KEY > `bl auth login` (active config profile).",
    "zh-CN":
      "百炼凭证来自 bl 鉴权链：--api-key > DASHSCOPE_API_KEY > `bl auth login`（当前激活的配置 Profile）。",
  },
  {
    "en-US":
      "Other providers read the env vars referenced in agents.yaml (e.g. ${ANTHROPIC_API_KEY}), including .env and ~/.agents/config.json.",
    "zh-CN":
      "其他 Provider 读取 agents.yaml 中引用的环境变量（例如 ${ANTHROPIC_API_KEY}），包括 .env 和 ~/.agents/config.json。",
  },
  {
    "en-US":
      "Resolved credentials are injected into the SDK in-memory and cleared from the environment; they never persist in process env.",
    "zh-CN": "解析后的凭证仅在内存中注入 SDK，并从环境中清除；不会持久保留在进程环境变量中。",
  },
];

/**
 * Shared `--help` note for commands that never talk to a provider: they load
 * agents.yaml / local state only, so no login or provider key is required.
 */
export const OFFLINE_NOTE = [
  {
    "en-US": "Runs fully offline against local files: no login or provider credentials required.",
    "zh-CN": "完全离线处理本地文件：无需登录或提供 Provider 凭证。",
  },
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
 * file bare-read or a stale env value. `api_key` is replaced unconditionally
 * when a credential resolved; `base_url` / `workspace_id` are filled only when
 * the block references them and the interpolated value is empty (a literal in
 * agents.yaml is respected).
 *
 * `base_url` carries {@link AGENTSTUDIO_API_PATH} because the SDK appends resource
 * paths onto it verbatim; a value already ending in the suffix is left as-is.
 * It is filled even without a credential — `client.baseUrl` is readable
 * credential-less (defaults to the CLI's model-domain base URL) — so offline
 * commands (which skip the credential assert) still satisfy the SDK's
 * "workspace_id or base_url" schema. With no credential the `api_key` is left
 * untouched: online commands reject it via {@link assertProviderCredentials}.
 */
export function injectProviderCredentials(
  providers: Record<string, unknown>,
  host: CredentialHost,
): void {
  const bailian = providers.bailian;
  if (!bailian || typeof bailian !== "object") return;
  const block = bailian as Record<string, unknown>;

  const cred = host.client.exportApiCredential();
  if (cred) block.api_key = cred.token;
  if ("base_url" in block && !block.base_url) {
    // Defensive normalization: the auth chain already normalizes base_url to
    // an origin, but never let a trailing slash produce "//api/v1/agentstudio".
    const origin = host.client.baseUrl.replace(/\/+$/, "");
    block.base_url = origin.endsWith(AGENTSTUDIO_API_PATH)
      ? origin
      : `${origin}${AGENTSTUDIO_API_PATH}`;
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
 * The SDK interpolates `${VAR}` into the raw YAML text, so an empty env var
 * leaves `api_key:` with nothing after it — YAML parses that as null. Normalize
 * every null provider field back to "" so the pipeline stays uniform: for
 * online commands an empty api_key is caught by {@link
 * assertProviderCredentials}; for offline commands (which skip the assert) the
 * blocks still satisfy the SDK's string schemas instead of failing zod with
 * "received null" before the run even starts.
 */
export function normalizeInterpolatedProviderBlocks(providers: Record<string, unknown>): void {
  for (const raw of Object.values(providers)) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    for (const [fieldName, value] of Object.entries(block)) {
      if (value === null) block[fieldName] = "";
    }
  }
}

/**
 * After injection, fail with a CLI-authoritative AUTH error if any configured
 * provider's `api_key` resolved empty (missing env var, or no bl login for
 * bailian). Replaces the SDK's raw `Environment variable '...' is not set` /
 * zod config error with a clean message plus a provider-specific hint. Validates
 * every declared provider by default. A scoped operation may pass its exact
 * provider list so unrelated credentials cannot block it; offline commands skip
 * the check entirely.
 */
export function assertProviderCredentials(
  providers: Record<string, unknown>,
  targetProviders?: readonly string[],
): void {
  for (const [name, raw] of Object.entries(providers)) {
    if (targetProviders && !targetProviders.includes(name)) continue;
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
