import { BailianError, ExitCode } from "bailian-cli-core";

/**
 * Allowed npm scopes for installable plugins (e.g. "@ali").
 */
export const REQUIRED_PLUGIN_SCOPES: readonly string[] = ["@ali"];

/** Built-in allowlist of plugin package names (full npm name). */
const BUILTIN_PLUGIN_ALLOWLIST: readonly string[] = [
  "@ali/bailian-plugin-agent",
  "@ali/bailian-plugin-test-fixture", // e2e test fixture only
];

/** User-facing hint when custom / non-allowlisted plugins are rejected. */
const UNSUPPORTED_HINT =
  "Only official allowlisted plugins are supported; custom plugins are not supported yet.";

export function getPluginAllowlist(): string[] {
  return [...BUILTIN_PLUGIN_ALLOWLIST];
}

export function isScopeValidationEnabled(): boolean {
  return REQUIRED_PLUGIN_SCOPES.length > 0;
}

export function hasRequiredScope(name: string): boolean {
  if (!isScopeValidationEnabled()) return true;
  return REQUIRED_PLUGIN_SCOPES.some((scope) => name.startsWith(`${scope}/`));
}

export function isPluginAllowed(name: string): boolean {
  if (!hasRequiredScope(name)) return false;
  return getPluginAllowlist().includes(name);
}

function formatAllowedScopes(): string {
  return REQUIRED_PLUGIN_SCOPES.join(", ");
}

function formatAllowedPlugins(): string {
  const filtered = getPluginAllowlist().filter(
    (name) => name !== "@ali/bailian-plugin-test-fixture",
  );
  return filtered.length > 0 ? filtered.join(", ") : "(none)";
}

/** Pre-install / pre-link gate; throws a readable error when the plugin is not allowed. */
export function assertPluginAllowed(name: string): void {
  if (isPluginAllowed(name)) return;

  const allowedPluginsText = formatAllowedPlugins();

  if (isScopeValidationEnabled() && !hasRequiredScope(name)) {
    throw new BailianError(
      `Plugin "${name}" is not under an allowed scope (${formatAllowedScopes()}). ${UNSUPPORTED_HINT}`,
      ExitCode.USAGE,
      `Allowed plugins: ${allowedPluginsText}`,
    );
  }

  throw new BailianError(
    `Plugin "${name}" is not on the install allowlist. ${UNSUPPORTED_HINT}`,
    ExitCode.USAGE,
    `Allowed plugins: ${allowedPluginsText}`,
  );
}
