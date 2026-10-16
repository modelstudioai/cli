// Shared building blocks for the Agent security commands (bl agents security *).
//
// AgentStudio uses the same per-workspace host scheme as the knowledge admin
// plane, so the --workspace-id flag and its three-level resolver are reused
// from there rather than duplicated — keeping the "workspace required" error
// identical across both command groups.
import {
  agentStudioHost,
  isDashScopeGateway,
  type LocalizedText,
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

/** Locale selector supplied by the command context (`ctx.localize`). */
export type Localize = (text: LocalizedText) => string;

// The API returns codes only — display names live here to match the console,
// localized to en-US / zh-CN per the resolved language.
export const CAPABILITY_LABELS: Record<string, LocalizedText> = {
  agent_identity: { "en-US": "Agent identity issuance", "zh-CN": "Agent 身份签发" },
  content_safety: { "en-US": "Content safety", "zh-CN": "内容安全" },
  supply_chain_scan: { "en-US": "Supply-chain static scan", "zh-CN": "供应链静态扫描" },
  credential_isolation: { "en-US": "Credential isolation", "zh-CN": "凭证隔离" },
  session_lifecycle: { "en-US": "Session lifecycle governance", "zh-CN": "session 生命周期治理" },
};

// Protection entries are keyed by asset type; the doc lists only the codes, so
// the display names are maintained here.
export const PROTECTION_LABELS: Record<string, LocalizedText> = {
  flow_agent: { "en-US": "Flow Agent", "zh-CN": "Flow Agent" },
  managed_agent: { "en-US": "Managed Agents", "zh-CN": "Managed Agents" },
  knowledge_base: { "en-US": "RAG", "zh-CN": "RAG" },
  memory: { "en-US": "Memory", "zh-CN": "Memory" },
  mcp: { "en-US": "Store", "zh-CN": "Store" },
  external_agent: { "en-US": "BYOA hosting", "zh-CN": "BYOA 托管" },
};

/** Detection cards summed into the overview banner: label + snake_case (REST) / camelCase (gateway) keys. */
export const SCAN_CARDS: Array<{ label: LocalizedText; keys: Array<keyof SecurityOverview> }> = [
  {
    label: { "en-US": "Content safety", "zh-CN": "内容安全" },
    keys: ["content_safety", "contentSafety"],
  },
  { label: { "en-US": "File scan", "zh-CN": "文件扫描" }, keys: ["file_scan", "fileScan"] },
  { label: { "en-US": "Skill scan", "zh-CN": "技能扫描" }, keys: ["skill_scan", "skillScan"] },
];

/** User-facing strings shared by the security commands, localized en-US / zh-CN. */
export const SECURITY_UI = {
  unavailable: { "en-US": "(unavailable)", "zh-CN": "（不可用）" },
  on: { "en-US": "on", "zh-CN": "开启" },
  off: { "en-US": "off", "zh-CN": "关闭" },
  scannedLabel: { "en-US": "Scanned", "zh-CN": "扫描" },
  risksLabel: { "en-US": "Risks", "zh-CN": "风险" },
  capabilities: { "en-US": "Capabilities", "zh-CN": "能力项" },
  protection: { "en-US": "Protection", "zh-CN": "防护项" },
  detections: { "en-US": "Detections", "zh-CN": "检测项" },
  overviewUnavailable: { "en-US": "Overview unavailable.", "zh-CN": "总览不可用。" },
  hit: { "en-US": "hit", "zh-CN": "命中" },
  scanned: { "en-US": "scanned", "zh-CN": "扫描" },
  total: { "en-US": "Total", "zh-CN": "总计" },
  high: { "en-US": "high", "zh-CN": "高" },
  medium: { "en-US": "medium", "zh-CN": "中" },
  low: { "en-US": "low", "zh-CN": "低" },
  noAlerts: { "en-US": "No alerts found.", "zh-CN": "未找到告警。" },
  nextPageCursor: { "en-US": "Next page cursor", "zh-CN": "下一页游标" },
  app: { "en-US": "app", "zh-CN": "应用" },
  asset: { "en-US": "asset", "zh-CN": "资产" },
  status: { "en-US": "status", "zh-CN": "状态" },
  source: { "en-US": "source", "zh-CN": "来源" },
  checked: { "en-US": "checked", "zh-CN": "检测时间" },
} satisfies Record<string, LocalizedText>;

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

/** Render a capability / protection toggle group; codes map to localized display names. */
export function renderToggles(
  localize: Localize,
  title: LocalizedText,
  toggles: SecurityToggle[] | null | undefined,
  labels: Record<string, LocalizedText>,
): void {
  emitBare(`\n${localize(title)}`);
  if (!toggles || toggles.length === 0) {
    emitBare(`  ${localize(SECURITY_UI.unavailable)}`);
    return;
  }
  for (const toggle of toggles) {
    const count = typeof toggle.count === "number" ? `  (${toggle.count})` : "";
    const state = localize(toggle.enabled ? SECURITY_UI.on : SECURITY_UI.off);
    const label = labels[toggle.key] ? localize(labels[toggle.key]) : toggle.key;
    emitBare(`  ${state}  ${label}${count}`);
  }
}

/** check_time / handle_time are millisecond timestamp strings, sometimes ISO 8601. */
export function formatSecurityTime(value: string | null | undefined): string {
  if (!value) return "-";
  const millis = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (Number.isNaN(millis)) return value;
  return new Date(millis).toISOString().replace("T", " ").slice(0, 19);
}

/** Render one alert row in text mode; field labels are localized. */
export function renderAlert(localize: Localize, alert: SecurityAlert): void {
  const level = (alert.risk_level ?? "unknown").toUpperCase();
  emitBare(`[${level}] ${alert.risk_name ?? "-"}  (${alert.alert_id})`);
  emitBare(
    `  ${localize(SECURITY_UI.app)}: ${alert.app_name ?? "-"}    ${localize(SECURITY_UI.asset)}: ${alert.asset_name ?? "-"} (${alert.asset_type ?? "-"})`,
  );
  emitBare(
    `  ${localize(SECURITY_UI.status)}: ${alert.status ?? "-"}    ${localize(SECURITY_UI.source)}: ${alert.source ?? "-"}    ${localize(SECURITY_UI.checked)}: ${formatSecurityTime(alert.check_time)}`,
  );
  if (alert.risk_desc) emitBare(`  ${alert.risk_desc}`);
  emitBare("");
}
