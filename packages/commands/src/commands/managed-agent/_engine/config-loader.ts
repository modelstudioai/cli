import {
  createProjectRuntime,
  type LoadedProjectConfig,
  type ProjectRuntimeContext,
  resolveProjectConfig,
  UserError,
} from "@openagentpack/sdk";
import {
  assertProviderCredentials,
  type CredentialHost,
  injectProviderCredentials,
  normalizeInterpolatedProviderBlocks,
  prepareProviderEnv,
  scrubCredentialEnv,
} from "./credentials.ts";
import { loadFileState } from "./file-state-manager.ts";
import { type HostContext, installSdkTransport } from "./transport.ts";

export { CREDENTIALS_NOTE, OFFLINE_NOTE } from "./credentials.ts";

/**
 * Whether this run requires provider keys:
 *   - "all" (default) — online command: every provider declared in agents.yaml
 *     must have a non-empty key after injection
 *   - "none" — offline command (local config/state only), skip the check
 */
export type CredentialScope = "all" | "none";

interface AgentConfigOptions {
  resolveEnv?: boolean;
  projectName?: string;
  statePath?: string;
  credentials?: CredentialScope;
}

/**
 * Resolve agents.yaml with credentials injected the bl way and scrubbed from the
 * environment — the shared credential spine for every SDK-engine command:
 *   1. prepare env (SDK bootstrap for non-bailian + placeholders so interpolation
 *      never throws on a value we're about to supply/reject)
 *   2. resolve + interpolate the config
 *   3. override the bailian block with the CLI auth chain's credential (in-memory)
 *   4. scrub all credential vars from process.env (real values now live only in
 *      the config object → provider adapters, never the environment)
 *   5. fail with a CLI-authoritative AUTH error if any provider's key is empty
 *      (offline commands pass `credentials: "none"` to skip the check)
 */
export async function resolveAgentProjectConfig(
  host: CredentialHost,
  filePath: string,
  options: AgentConfigOptions = {},
): Promise<LoadedProjectConfig> {
  prepareProviderEnv();
  const resolved = await resolveProjectConfig(filePath, options);
  normalizeInterpolatedProviderBlocks(resolved.config.providers);
  injectProviderCredentials(resolved.config.providers, host);
  scrubCredentialEnv();
  if ((options.credentials ?? "all") !== "none") {
    assertProviderCredentials(resolved.config.providers);
  }
  return resolved;
}

/**
 * Build a full ProjectRuntimeContext from a config file path — the standard
 * entry point for agent commands that need the SDK engine. Mirrors OpenAgentPack
 * CLI's buildCliRuntime: resolve config → load local state → assemble runtime.
 * Takes the host context first so every SDK-engine command wires the
 * instrumented transport (UA / tracking headers / verbose) and the bl-resolved,
 * in-memory-injected credential ({@link resolveAgentProjectConfig}) by construction.
 */
export async function buildAgentRuntime(
  host: HostContext & CredentialHost,
  filePath: string,
  options: AgentConfigOptions = {},
): Promise<ProjectRuntimeContext & { configPath: string }> {
  installSdkTransport(host);
  const { config, configPath, projectName } = await resolveAgentProjectConfig(
    host,
    filePath,
    options,
  );
  const state = await loadFileState(configPath, options.statePath, projectName);
  const ctx = createProjectRuntime({
    projectName,
    config,
    state,
    configPath,
    providers: config.providers,
  });
  return { ...ctx, configPath };
}

/** Ensure a user-supplied --provider value is actually configured in agents.yaml. */
export function assertProviderConfigured(
  ctx: ProjectRuntimeContext,
  provider: string | undefined,
): void {
  if (!provider || provider === "all") return;
  if (ctx.providers.has(provider)) return;
  const available = Array.from(ctx.providers.keys()).join(", ") || "none";
  throw new UserError(
    `Provider '${provider}' is not configured. Available providers: ${available}.`,
  );
}
