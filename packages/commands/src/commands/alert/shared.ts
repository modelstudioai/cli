import { UsageError, unwrapResponse, type Client, type FlagsDef } from "bailian-cli-core";
import { parseCommaList } from "../shared/params.ts";
import { ensureTelemetryReady, ensureTelemetryRegionSupported } from "../shared/telemetry.ts";

// ---------------------------------------------------------------------------
// Alert rule write payload (shared by create / update)
// ---------------------------------------------------------------------------

/** Same default notification template as the console. */
export const DEFAULT_ALERT_MESSAGE =
  '业务空间（{{$tags.workspace_id}}）下的模型（{{$tags.model}}）发生告警，当前值为{{ printf "%.2f" $value }}';

/** Frontend "no silence" sentinel: max int32 means never re-notify. */
export const NO_SILENCE = 2147483647;

export const ALERT_LEVELS = ["INFO", "WARNING", "ERROR"] as const;

/** Rule field flags shared by `alert create` and `alert update`. */
export const ALERT_RULE_WRITE_FLAGS = {
  name: {
    type: "string",
    valueHint: "<name>",
    required: true,
    description: {
      "en-US": "Alert rule name (max 64 chars)",
      "zh-CN": "告警规则名称（最长 64 字符）",
    },
  },
  templateId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: {
      "en-US": "Alert template ID (from `alert template list`)",
      "zh-CN": "告警模板 ID（可由 alert template list 获得）",
    },
  },
  model: {
    type: "string",
    valueHint: "<model>",
    required: true,
    description: {
      "en-US": "Model name(s) to alert on, comma-separated",
      "zh-CN": "告警生效的模型名称，多个以逗号分隔",
    },
  },
  message: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Alert notification content (Go template); defaults to the console template",
      "zh-CN": "告警通知内容（Go 模板语法），默认与控制台一致",
    },
  },
  level: {
    type: "string",
    valueHint: "<level>",
    choices: ALERT_LEVELS,
    description: {
      "en-US": "Alert level (default: INFO)",
      "zh-CN": "告警等级（默认：INFO）",
    },
  },
  interval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Check interval in seconds (default: 60)",
      "zh-CN": "告警检查周期（秒，默认：60）",
    },
  },
  duration: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "How long the condition must hold before alerting; 0 = immediately (default: 60)",
      "zh-CN": "条件持续多久后告警（秒），0 表示立即告警（默认：60）",
    },
  },
  contact: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "CMS alert contact ID(s), comma-separated; create them in the CloudMonitor console",
      "zh-CN": "云监控告警联系人 ID，多个以逗号分隔；需在云监控控制台创建",
    },
  },
  contactGroup: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "CMS alert contact group ID(s), comma-separated",
      "zh-CN": "云监控告警联系组 ID，多个以逗号分隔",
    },
  },
  notifyWindow: {
    type: "string",
    valueHint: "<HH:mm-HH:mm>",
    description: {
      "en-US": "Daily notification window (default: 00:00-23:59)",
      "zh-CN": "每日通知时间窗口（默认：00:00-23:59）",
    },
  },
  notifyDays: {
    type: "string",
    valueHint: "<days>",
    description: {
      "en-US": "Days of week to notify, 1-7 comma-separated (default: every day)",
      "zh-CN": "每周通知日，1-7 逗号分隔（默认：每天）",
    },
  },
  silence: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Silence period between repeat notifications (default: never repeat)",
      "zh-CN": "重复通知的静默时间（秒，默认：不重复通知）",
    },
  },
  gmtOffset: {
    type: "string",
    valueHint: "<offset>",
    description: {
      "en-US": "Timezone offset for the notify window (default: +0800)",
      "zh-CN": "通知窗口的时区偏移（默认：+0800）",
    },
  },
} satisfies FlagsDef;

export interface AlertRuleFlags {
  name?: string;
  templateId?: string;
  model?: string;
  message?: string;
  level?: "INFO" | "WARNING" | "ERROR";
  interval?: number;
  duration?: number;
  contact?: string;
  contactGroup?: string;
  notifyWindow?: string;
  notifyDays?: string;
  silence?: number;
  gmtOffset?: string;
}

/** Validate the notification-related flags shared by create/update. */
export function validateAlertRuleFlags(flags: AlertRuleFlags): string | undefined {
  if (flags.notifyWindow) {
    const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(flags.notifyWindow);
    if (!match) return "--notify-window must be in HH:mm-HH:mm format, e.g. 09:00-18:00.";
  }
  if (flags.notifyDays) {
    const days = parseCommaList(flags.notifyDays);
    const invalid = days.filter((day) => !/^[1-7]$/.test(day));
    if (invalid.length > 0) return "--notify-days accepts values 1-7, e.g. 1,2,3,4,5.";
  }
  if (flags.interval != null && flags.interval < 1) return "--interval must be positive seconds.";
  if (flags.duration != null && flags.duration < 0) return "--duration must be >= 0 seconds.";
  if (flags.silence != null && flags.silence < 0) return "--silence must be >= 0 seconds.";
  if (flags.gmtOffset != null && !/^[+-]\d{4}$/.test(flags.gmtOffset)) {
    return "--gmt-offset must look like +0800.";
  }
  return undefined;
}

/** Build the alertRule.createAlertRule / updateAlertRule reqDTO from CLI flags. */
export function buildAlertRuleReqDTO(
  flags: AlertRuleFlags & { name: string; templateId: string; model: string },
): Record<string, unknown> {
  if (flags.interval === 0) throw new UsageError("--interval must be positive seconds.");

  const windowMatch = flags.notifyWindow
    ? /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(flags.notifyWindow)
    : null;

  return {
    name: flags.name,
    templateId: flags.templateId,
    resourceIds: parseCommaList(flags.model),
    message: flags.message ?? DEFAULT_ALERT_MESSAGE,
    level: flags.level ?? "INFO",
    interval: flags.interval ?? 60,
    duration: flags.duration ?? 60,
    notification: {
      startTime: windowMatch?.[1] ?? "00:00",
      endTime: windowMatch?.[2] ?? "23:59",
      gmtOffset: flags.gmtOffset ?? "+0800",
      dayOfWeek: flags.notifyDays
        ? parseCommaList(flags.notifyDays).map(Number)
        : [1, 2, 3, 4, 5, 6, 7],
      silenceTime: flags.silence ?? NO_SILENCE,
      contacts: flags.contact ? parseCommaList(flags.contact) : undefined,
      contactGroups: flags.contactGroup ? parseCommaList(flags.contactGroup) : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// CMS preflight for alert commands
// ---------------------------------------------------------------------------

/**
 * Alert rules live on CMS, which the console gates with the ModelMonitor
 * service status. Fail fast with an actionable hint when it is not activated.
 */
export async function ensureAlertReady(
  client: Client,
  workspaceId: string | undefined,
  binName: string,
  settings: Parameters<typeof ensureTelemetryRegionSupported>[0],
): Promise<void> {
  ensureTelemetryRegionSupported(settings);
  await ensureTelemetryReady(client, {
    serviceType: "ModelMonitor",
    workspaceId,
    enableCommand: `${binName} monitor delivery enable`,
    requireInstance: false,
  });
}

// ---------------------------------------------------------------------------
// Alert template conditions
// ---------------------------------------------------------------------------

export const COMPARE_TYPES = [">", ">=", "<", "<=", "==", "!="] as const;

export interface TemplateCondition {
  metricName: string;
  aggregator: string;
  compareType: string;
  compareValue: string;
  period: number;
}

/**
 * Parse one --condition value: `metricName:aggregator:compareType:value:period`,
 * e.g. `model_call_failed_count:sum:>:10:60`.
 */
export function parseCondition(raw: string): TemplateCondition {
  const parts = raw.split(":");
  if (parts.length !== 5) {
    throw new UsageError(
      `Invalid --condition "${raw}". Expected metricName:aggregator:compareType:value:period. ` +
        "If the value contains > or <, wrap the whole condition in quotes so the shell does not treat it as redirection.",
    );
  }
  const [metricName, aggregator, compareType, compareValue, periodRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (!metricName || !aggregator) {
    throw new UsageError(`Invalid --condition "${raw}": metricName and aggregator are required.`);
  }
  if (!(COMPARE_TYPES as readonly string[]).includes(compareType)) {
    throw new UsageError(
      `Invalid --condition "${raw}": compareType must be one of ${COMPARE_TYPES.join(" ")}.`,
    );
  }
  const period = Number(periodRaw);
  if (!Number.isFinite(period) || period < 1) {
    throw new UsageError(`Invalid --condition "${raw}": period must be positive seconds.`);
  }
  return { metricName, aggregator, compareType, compareValue, period };
}

/** Templates accept 1-10 conditions; validate() runs before run, parse errors surface there too. */
export function validateTemplateConditions(
  conditions: string[] | undefined,
  allowFrom: boolean,
): string | undefined {
  if (!conditions || conditions.length === 0) {
    return allowFrom
      ? undefined
      : "At least one --condition is required (or use --from to copy a template).";
  }
  if (conditions.length > 10) {
    return "At most 10 --condition entries are allowed.";
  }
  for (const raw of conditions) {
    try {
      parseCondition(raw);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export interface AlertPage<T> {
  list: T[];
  totalCount: number;
  nextToken?: string;
}

export function extractAlertPage<T>(raw: unknown): AlertPage<T> {
  const resp = unwrapResponse(raw as Record<string, unknown>);
  return {
    list: (resp.list as T[]) ?? [],
    totalCount: (resp.totalCount as number) ?? 0,
    nextToken: resp.nextToken as string | undefined,
  };
}
