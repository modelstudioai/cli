import {
  createProjectRuntime,
  type ProjectRuntimeContext,
  resolveProjectConfig,
  UserError,
} from "@openagentpack/sdk";
import { ensureCredentials } from "./credentials.ts";
import { loadFileState } from "./file-state-manager.ts";
import { type HostContext, installSdkTransport } from "./transport.ts";

export { CREDENTIALS_NOTE } from "./credentials.ts";

/**
 * Build a full ProjectRuntimeContext from a config file path — the standard
 * entry point for agent commands that need the SDK engine. Mirrors OpenAgentPack
 * CLI's buildCliRuntime: resolve config → load local state → assemble runtime.
 * Takes the host context first so every SDK-engine command wires the
 * instrumented transport (UA / tracking headers / verbose) by construction.
 */
export async function buildAgentRuntime(
  host: HostContext,
  filePath: string,
  options: {
    resolveEnv?: boolean;
    projectName?: string;
    statePath?: string;
  } = {},
): Promise<ProjectRuntimeContext & { configPath: string }> {
  installSdkTransport(host);
  ensureCredentials();
  const { config, configPath, projectName } = await resolveProjectConfig(filePath, options);
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
