import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type BackendRuntimeInput,
  LocalFileStateBackend,
  resolveProjectConfigFromObject,
} from "@openagentpack/sdk";
import { getConfigDir } from "bailian-cli-core";
import {
  assertProviderCredentials,
  type CredentialHost,
  injectProviderCredentials,
  normalizeInterpolatedProviderBlocks,
  prepareProviderEnv,
  scrubCredentialEnv,
} from "./credentials.ts";
import { type HostContext, installSdkTransport } from "./transport.ts";

/** Default agent identity `bl managed-agent run` materializes and reuses. */
export const DEFAULT_INLINE_AGENT = "dsh-remote-runner";

/** Default model for the materialized agent. */
export const DEFAULT_INLINE_MODEL = "qwen3.8-max";

/** Default role when the caller supplies no `--instructions`. */
export const DEFAULT_INLINE_INSTRUCTIONS = "You are a helpful assistant. Complete the task.";

/** Environment name declared in the inline config; one cloud env per agent. */
const INLINE_ENVIRONMENT = "cloud";

export interface InlineAgentOptions {
  agentName: string;
  instructions: string;
  model: string;
  /** Override the persisted state location (defaults under the bl config dir). */
  statePath?: string;
}

/**
 * Slugify an agent name into a filesystem- and project-id-safe token. The state
 * for each distinct agent lives in its own directory so repeat runs reuse the
 * same materialized remote agent.
 */
function slugify(agentName: string): string {
  const slug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "agent";
}

/** Where a materialized agent's state is persisted (not the user's cwd). */
export function inlineStatePath(agentName: string): string {
  return join(getConfigDir(), "managed-agent", slugify(agentName), "state.json");
}

/**
 * The minimal in-memory project config that materializes into one cloud agent.
 * `providers.bailian` carries empty `api_key`/`base_url` placeholders so
 * {@link injectProviderCredentials} fills them from bl's auth chain (it only
 * writes fields the block already declares).
 */
export function buildInlineConfig(opts: InlineAgentOptions): Record<string, unknown> {
  return {
    version: "1",
    providers: {
      bailian: { api_key: "", base_url: "" },
    },
    defaults: { provider: "bailian" },
    environments: {
      [INLINE_ENVIRONMENT]: {
        description: "Bailian CLI cloud environment",
        config: { type: "cloud", networking: { type: "unrestricted" } },
      },
    },
    agents: {
      [opts.agentName]: {
        description: opts.agentName,
        model: opts.model,
        instructions: opts.instructions,
        environment: INLINE_ENVIRONMENT,
        provider: "bailian",
      },
    },
  };
}

/**
 * Build the `BackendRuntimeInput` shared by ensure (`syncAgentResourcesWith
 * StateBackend`) and run (`readProjectRuntime` + `startSessionRun`). Mirrors the
 * credential spine of {@link buildAgentRuntime} but sources config from an
 * in-memory object instead of a file, so no `agents.yaml` or `apply` is required.
 */
export async function buildInlineBackendInput(
  host: HostContext & CredentialHost,
  opts: InlineAgentOptions,
): Promise<BackendRuntimeInput> {
  installSdkTransport(host);
  prepareProviderEnv();

  const rawConfig = buildInlineConfig(opts);
  const { config, projectName } = await resolveProjectConfigFromObject(rawConfig, {
    projectName: slugify(opts.agentName),
  });

  normalizeInterpolatedProviderBlocks(config.providers);
  injectProviderCredentials(config.providers, host);
  scrubCredentialEnv();
  assertProviderCredentials(config.providers);

  const statePath = opts.statePath ?? inlineStatePath(opts.agentName);
  mkdirSync(dirname(statePath), { recursive: true });
  const stateBackend = new LocalFileStateBackend({ statePath });

  return {
    projectName,
    config,
    stateBackend,
    stateScope: { projectId: slugify(opts.agentName) },
    providers: config.providers,
  };
}
