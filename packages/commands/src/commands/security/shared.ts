// Shared building blocks for the Agent security commands (bl security *).
//
// AgentStudio uses the same per-workspace host scheme as the knowledge admin
// plane, so the --workspace-id flag and its three-level resolver are reused
// from there rather than duplicated — keeping the "workspace required" error
// identical across both command groups.
import {
  agentStudioHost,
  isDashScopeGateway,
  type SecurityAlert,
  type SecurityOverview,
  type SecurityToggle,
} from "bailian-cli-core";
import { emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "../knowledge/shared.ts";

export { resolveWorkspaceId, WORKSPACE_FLAG };

/**
 * Resolve the AgentStudio host these commands talk to.
 *
 * Default: derive the per-workspace production host from --workspace-id (or
 * BAILIAN_WORKSPACE_ID / config). But when the model base URL has been pointed
 * at a non-DashScope origin — an explicit --base-url / DASHSCOPE_BASE_URL for a
 * pre-release, private, or mock deployment — honor it as the host override and
 * skip the workspace requirement (that origin is already fully qualified).
 */
export function resolveSecurityHost(ctx: {
  client: { baseUrl: string };
  flags: { workspaceId?: string };
  settings: { workspaceId?: string };
  identity: { binName: string };
}): string {
  const origin = ctx.client.baseUrl.replace(/\/+$/, "");
  if (origin && !isDashScopeGateway(origin)) return origin;
  return agentStudioHost(resolveWorkspaceId(ctx));
}

// The API returns codes only — display names live here to match the console.
export const CAPABILITY_LABELS: Record<string, string> = {
  agent_identity: "Agent 身份签发",
  content_safety: "内容安全",
  supply_chain_scan: "供应链静态扫描",
  credential_isolation: "凭证隔离",
  session_lifecycle: "session 生命周期治理",
};

// Protection entries are keyed by asset type; the doc lists only the codes, so
// the display names are maintained here.
export const PROTECTION_LABELS: Record<string, string> = {
  flow_agent: "Flow Agent",
  managed_agent: "Managed Agents",
  knowledge_base: "RAG",
  memory: "Memory",
  mcp: "Store",
  external_agent: "BYOA 托管",
};

/** Detection cards summed into the overview banner: label + snake_case (REST) / camelCase (gateway) keys. */
export const SCAN_CARDS: Array<{ label: string; keys: Array<keyof SecurityOverview> }> = [
  { label: "内容安全", keys: ["content_safety", "contentSafety"] },
  { label: "文件扫描", keys: ["file_scan", "fileScan"] },
  { label: "技能扫描", keys: ["skill_scan", "skillScan"] },
];

/** Append a query param only when present; arrays append each item (repeatable). */
export function setSecurityParam(
  params: URLSearchParams,
  key: string,
  value: string | number | string[] | null | undefined,
): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    for (const entry of value) params.append(key, entry);
    return;
  }
  params.set(key, String(value));
}

/** Render a capability / protection toggle group; codes map to display names. */
export function renderToggles(
  title: string,
  toggles: SecurityToggle[] | null | undefined,
  labels: Record<string, string>,
): void {
  emitBare(`\n${title}`);
  if (!toggles || toggles.length === 0) {
    emitBare("  (unavailable)");
    return;
  }
  for (const toggle of toggles) {
    const count = typeof toggle.count === "number" ? `  (${toggle.count})` : "";
    emitBare(`  ${toggle.enabled ? "on " : "off"}  ${labels[toggle.key] ?? toggle.key}${count}`);
  }
}

/** check_time / handle_time are millisecond timestamp strings, sometimes ISO 8601. */
export function formatSecurityTime(value: string | null | undefined): string {
  if (!value) return "-";
  const millis = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (Number.isNaN(millis)) return value;
  return new Date(millis).toISOString().replace("T", " ").slice(0, 19);
}

/** Render one alert row in text mode. */
export function renderAlert(alert: SecurityAlert): void {
  const level = (alert.risk_level ?? "unknown").toUpperCase();
  emitBare(`[${level}] ${alert.risk_name ?? "-"}  (${alert.alert_id})`);
  emitBare(
    `  app: ${alert.app_name ?? "-"}    asset: ${alert.asset_name ?? "-"} (${alert.asset_type ?? "-"})`,
  );
  emitBare(
    `  status: ${alert.status ?? "-"}    source: ${alert.source ?? "-"}    checked: ${formatSecurityTime(alert.check_time)}`,
  );
  if (alert.risk_desc) emitBare(`  ${alert.risk_desc}`);
  emitBare("");
}
