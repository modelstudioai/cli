import { buildSettings, buildSources } from "../config/loader.ts";
import type { Identity, Settings } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { BINARY_PRODUCT_CLIENT_NAME } from "../install/method.ts";
import { readInstallAttribution, type InstallAttribution } from "../install/record.ts";
import type { AuthRequirement } from "../types/command.ts";
import { normalizeBizFrom, type CallerAttribution } from "./caller.ts";
import { createFirstInstallEvent, createTrackingEvent } from "./event.ts";
import {
  FIRST_INSTALL_REPORT_ATTEMPTS,
  noteFirstInstallReportQueued,
  readFirstInstallReportAttempts,
} from "./first-install.ts";
import { flushTelemetry, localSink, remoteSink } from "./sink.ts";

const GLOBAL_FLAG_KEYS = new Set([
  "apiKey",
  "baseUrl",
  "output",
  "quiet",
  "verbose",
  "timeout",
  "dryRun",
  "help",
  "console",
]);

/**
 * Allowlist of flag names safe to send to telemetry.
 *
 * Default is to NOT report. Only flags whose value space is enumerable / numeric / boolean
 * (and therefore cannot leak user content, credentials, file paths, URLs, or customer IDs)
 * belong here. When adding a new flag, ask: could this field carry PII, secrets, prompts,
 * file paths, URLs, or tenant identifiers? If yes, do NOT add it.
 */
const PARAM_ALLOWLIST = new Set([
  // Pagination / counts
  "page",
  "pageSize",
  "n",
  "count",
  // Model / voice / language selectors (public identifiers)
  "model",
  "voice",
  "language",
  "provider",
  "capability",
  // Generation params
  "temperature",
  "topP",
  "topK",
  "maxTokens",
  "seed",
  "stream",
  // Media specs
  "size",
  "resolution",
  "ratio",
  "duration",
  "format",
  "audioFormat",
  "sampleRate",
  "pitch",
  "rate",
  "volume",
  // Console gateway API name (public service identifier, not PII)
  "api",
  // Mode / behavior flags
  "mode",
  "download",
  "textOnly",
  "promptExtend",
  "enableSsml",
  "watermark",
  "hasThoughts",
  "listTools",
  "rerank",
  "rerankTopN",
  "diarization",
]);

/**
 * bailian-cli reads an existing install.json. kscli does not.
 * A missing or broken file stays unreported, and this never creates one.
 */
function readCommandInstallAttribution(identity: Identity): InstallAttribution | undefined {
  if (identity.npmPackage !== BINARY_PRODUCT_CLIENT_NAME) return undefined;
  try {
    return readInstallAttribution();
  } catch {
    return undefined;
  }
}

function extractParams(flags: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith("_")) continue;
    if (GLOBAL_FLAG_KEYS.has(key)) continue;
    if (!PARAM_ALLOWLIST.has(key)) continue;
    if (value === undefined || value === false) continue;
    // Some commands use page for an opaque cursor rather than a numeric page.
    if (key === "page" && (typeof value !== "number" || !Number.isFinite(value))) continue;
    params[key] = value;
  }
  return params;
}

/**
 * Queue the install-day event once, when install has just succeeded.
 * A failed queue does not consume the attempt. Nothing here may fail install.
 */
async function reportFirstInstall(
  identity: Identity,
  install: InstallAttribution | undefined,
): Promise<void> {
  if (!install?.firstInstalledAt) return;
  const firstInstalledAt = install.firstInstalledAt;
  try {
    if (readFirstInstallReportAttempts(firstInstalledAt) >= FIRST_INSTALL_REPORT_ATTEMPTS) return;
    const report = createFirstInstallEvent({
      firstInstalledAt,
      installChannel: install.installChannel,
      cliVersion: identity.version,
    });
    localSink(report).catch(() => {});
    const queued = await remoteSink(report);
    if (queued) noteFirstInstallReportQueued(firstInstalledAt);
  } catch {
    // Telemetry must never affect the CLI main flow
  }
}

/**
 * Same switch as a normal command: `DO_NOT_TRACK=1` or `telemetry: false`.
 * A config that cannot be read does not enable a report and must not throw.
 */
function installReportTelemetryEnabled(): boolean {
  if (process.env.DO_NOT_TRACK === "1") return false;
  try {
    return buildSettings(buildSources({})).telemetry;
  } catch {
    return false;
  }
}

/**
 * Called by the installer as soon as a new user's install.json is on disk.
 * Not used by ordinary command telemetry.
 */
export async function reportFirstInstallNow(identity: Identity): Promise<void> {
  if (!installReportTelemetryEnabled()) return;
  if (identity.npmPackage !== BINARY_PRODUCT_CLIENT_NAME) return;
  try {
    await reportFirstInstall(identity, readCommandInstallAttribution(identity));
    await flushTelemetry(1000);
  } catch {
    // A report failure must not fail installation.
  }
}

/** 遥测只记录命令声明的鉴权域,不接触具体凭证能力。 */
export interface TrackingDeps {
  identity: Identity;
  settings: Settings;
  authMethod?: AuthRequirement;
  /** From `readCaller(process.env)` in telemetryStage. */
  caller: CallerAttribution;
}

export async function trackCommandExecution(
  deps: TrackingDeps,
  commandPath: string[],
  flags: Record<string, unknown>,
  fn: () => Promise<void>,
): Promise<void> {
  if (!deps.settings.telemetry) {
    await fn();
    return;
  }

  const start = performance.now();
  let success = true;
  let errorMessage: string | undefined;
  let exitCode: number | undefined;
  let httpStatus: number | undefined;
  let requestId: string | undefined;

  try {
    await fn();
  } catch (err) {
    success = false;
    if (err instanceof BailianError) {
      errorMessage = err.message;
      exitCode = err.exitCode;
      httpStatus = err.api?.httpStatus;
      requestId = err.api?.requestId;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - start);
    const install = readCommandInstallAttribution(deps.identity);

    const event = createTrackingEvent({
      command: commandPath.join(" "),
      durationMs,
      success,
      error: success ? undefined : { message: errorMessage, exitCode, httpStatus, requestId },
      identity: deps.identity,
      authMethod: deps.authMethod,
      params: extractParams(flags),
      caller: deps.caller,
      install,
      bizFrom: normalizeBizFrom(deps.settings.bizFrom),
    });

    // The install day is reported when install succeeds, not from this command.
    localSink(event).catch(() => {});
    remoteSink(event).catch(() => {});
  }
}
