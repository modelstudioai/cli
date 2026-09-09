// Types for the Agent Security Center (AgentStudio). The server returns codes
// only — display names are maintained by the client (see commands/security).
// Kept separate from api.ts, mirroring knowledge-admin.ts.

/** A capability / protection switch keyed by a stable code. */
export interface SecurityToggle {
  key: string;
  enabled: boolean;
}

/** Detection card: `hit` is the headline number, `scanned` the total. */
export interface SecurityScanStat {
  hit: number | null;
  scanned: number | null;
}

/** Protection overview — fixed to the last 24 hours, no request params. */
export interface SecurityOverview {
  capabilities?: SecurityToggle[] | null;
  protection?: SecurityToggle[] | null;
  content_safety?: SecurityScanStat | null;
  file_scan?: SecurityScanStat | null;
  skill_scan?: SecurityScanStat | null;
}

export type SecurityRiskLevel = "high" | "medium" | "low";

/** A single alert row from agent_logs. */
export interface SecurityAlert {
  alert_id: string;
  risk_level?: SecurityRiskLevel | null;
  risk_name?: string | null;
  risk_desc?: string | null;
  asset_type?: string | null;
  asset_name?: string | null;
  app_id?: string | null;
  app_name?: string | null;
  agent_name?: string | null;
  status?: string | null;
  source?: string | null;
  /** Millisecond timestamp string; some environments return ISO 8601 instead. */
  check_time?: string | null;
  handle_time?: string | null;
  vendor?: string | null;
}

/** agent_logs list — cursor paginated; `next_page` is null on the last page. */
export interface SecurityAlertList {
  stats?: {
    total?: number | null;
    high?: number | null;
    medium?: number | null;
    low?: number | null;
  } | null;
  data?: SecurityAlert[] | null;
  next_page?: string | number | null;
}
