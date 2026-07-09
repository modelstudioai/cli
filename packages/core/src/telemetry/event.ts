import type { AuthRequirement } from "../types/command.ts";

export interface TrackingEvent {
  command: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  httpStatus?: number;
  requestId?: string;
  cliVersion: string;
  nodeVersion: string;
  os: string;
  authMethod?: AuthRequirement;
  params?: Record<string, unknown>;
}

export function createTrackingEvent(opts: {
  command: string;
  durationMs: number;
  success: boolean;
  error?: { message?: string; httpStatus?: number; requestId?: string };
  cliVersion: string;
  authMethod?: AuthRequirement;
  params?: Record<string, unknown>;
}): TrackingEvent {
  const event: TrackingEvent = {
    command: opts.command,
    timestamp: new Date().toISOString(),
    durationMs: opts.durationMs,
    success: opts.success,
    cliVersion: opts.cliVersion,
    nodeVersion: process.version,
    os: process.platform,
  };

  if (opts.authMethod) {
    event.authMethod = opts.authMethod;
  }

  if (!opts.success && opts.error) {
    if (opts.error.message) event.errorMessage = opts.error.message;
    if (opts.error.httpStatus !== undefined) event.httpStatus = opts.error.httpStatus;
    if (opts.error.requestId) event.requestId = opts.error.requestId;
  }

  if (opts.params && Object.keys(opts.params).length > 0) {
    event.params = opts.params;
  }

  return event;
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
