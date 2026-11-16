import type { Identity } from "../config/schema.ts";
import type { InstallAttribution } from "../install/record.ts";
import { formatCommand } from "../output/command.ts";
import type { AuthRequirement } from "../types/command.ts";
import type { CallerAttribution } from "./caller.ts";

export interface TrackingEvent {
  command: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  exitCode?: number;
  httpStatus?: number;
  requestId?: string;
  cliVersion: string;
  commandPrefix: string;
  nodeVersion: string;
  os: string;
  authMethod?: AuthRequirement;
  params?: Record<string, unknown>;
  /** Always present on new CLI events: `agent` | `script` | `unknown`. */
  callerType: CallerAttribution["callerType"];
  callerName?: string;
  skillName?: string;
  skillVersion?: string;
  /** Channel from install.json. The install day is a separate event. */
  installChannel?: InstallAttribution["installChannel"];
}

export function createTrackingEvent(opts: {
  command: string;
  durationMs: number;
  success: boolean;
  error?: { message?: string; exitCode?: number; httpStatus?: number; requestId?: string };
  identity: Identity;
  authMethod?: AuthRequirement;
  params?: Record<string, unknown>;
  caller: CallerAttribution;
  /** Already-read install record. Callers must not create the file to fill this in. */
  install?: InstallAttribution;
}): TrackingEvent {
  const event: TrackingEvent = {
    command: opts.command,
    timestamp: new Date().toISOString(),
    durationMs: opts.durationMs,
    success: opts.success,
    cliVersion: opts.identity.version,
    commandPrefix: formatCommand(opts.identity),
    nodeVersion: process.version,
    os: process.platform,
    callerType: opts.caller.callerType,
  };

  if (opts.caller.callerType === "agent") {
    event.callerName = opts.caller.callerName;
    if (opts.caller.skillName !== undefined) event.skillName = opts.caller.skillName;
    if (opts.caller.skillVersion !== undefined) event.skillVersion = opts.caller.skillVersion;
  } else if (opts.caller.callerType === "script") {
    event.callerName = opts.caller.callerName;
  }

  if (opts.authMethod) {
    event.authMethod = opts.authMethod;
  }

  if (!opts.success && opts.error) {
    if (opts.error.message) event.errorMessage = opts.error.message;
    if (opts.error.exitCode !== undefined) event.exitCode = opts.error.exitCode;
    if (opts.error.httpStatus !== undefined) event.httpStatus = opts.error.httpStatus;
    if (opts.error.requestId) event.requestId = opts.error.requestId;
  }

  if (opts.params && Object.keys(opts.params).length > 0) {
    event.params = opts.params;
  }

  if (opts.install) {
    event.installChannel = opts.install.installChannel;
  }

  return event;
}

/** Event name for a machine's first install day. Not a command path. */
export const FIRST_INSTALL_EVENT_NAME = "first_install";

export interface FirstInstallEvent {
  kind: typeof FIRST_INSTALL_EVENT_NAME;
  /** When this report was queued, not the install day. */
  timestamp: string;
  firstInstalledAt: string;
  installChannel: InstallAttribution["installChannel"];
  cliVersion: string;
}

export function isFirstInstallEvent(
  event: TrackingEvent | FirstInstallEvent,
): event is FirstInstallEvent {
  return "kind" in event && event.kind === FIRST_INSTALL_EVENT_NAME;
}

export function createFirstInstallEvent(opts: {
  firstInstalledAt: string;
  installChannel: InstallAttribution["installChannel"];
  cliVersion: string;
  reportedAt?: Date;
}): FirstInstallEvent {
  return {
    kind: FIRST_INSTALL_EVENT_NAME,
    timestamp: (opts.reportedAt ?? new Date()).toISOString(),
    firstInstalledAt: opts.firstInstalledAt,
    installChannel: opts.installChannel,
    cliVersion: opts.cliVersion,
  };
}

export function buildFirstInstallAemOptions(event: FirstInstallEvent): Record<string, unknown> {
  return {
    et: "EXP",
    ext: {
      timestamp: event.timestamp,
      firstInstalledAt: event.firstInstalledAt,
      installChannel: event.installChannel,
      cliVersion: event.cliVersion,
    },
  };
}

const AEM_TEXT_MAX = 500;

function aemText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length <= AEM_TEXT_MAX ? s : s.slice(0, AEM_TEXT_MAX);
}

export function buildRemoteAemOptions(event: TrackingEvent): Record<string, unknown> {
  const { command: _command, params, ...extFields } = event;

  const opts: Record<string, unknown> = {
    et: "EXP",
    ext: extFields,
    c1: params,
    c2: event.success ? "success" : "failure",
  };

  if (event.httpStatus !== undefined) {
    opts.c3 = String(event.httpStatus);
  }
  if (event.errorMessage) {
    opts.c4 = aemText(event.errorMessage);
  }
  if (event.requestId) {
    opts.c5 = event.requestId;
  }

  return opts;
}
