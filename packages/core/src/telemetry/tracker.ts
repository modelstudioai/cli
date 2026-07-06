import type { Identity, Settings } from "../config/schema.ts";
import { BailianError } from "../errors/base.ts";
import { createTrackingEvent } from "./event.ts";
import { localSink, remoteSink } from "./sink.ts";

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

function extractParams(flags: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith("_")) continue;
    if (GLOBAL_FLAG_KEYS.has(key)) continue;
    if (!PARAM_ALLOWLIST.has(key)) continue;
    if (value === undefined || value === false) continue;
    params[key] = value;
  }
  return params;
}

/** 遥测依赖:authMethod 由调用方(telemetryStage)从解析结果算好后传值——遥测不该拿到凭证能力。 */
export interface TrackingDeps {
  identity: Identity;
  settings: Settings;
  authMethod?: "api-key" | "access-token";
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
  let httpStatus: number | undefined;
  let requestId: string | undefined;

  try {
    await fn();
  } catch (err) {
    success = false;
    if (err instanceof BailianError) {
      errorMessage = err.message;
      httpStatus = err.api?.httpStatus;
      requestId = err.api?.requestId;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - start);

    const event = createTrackingEvent({
      command: commandPath.join(" "),
      durationMs,
      success,
      error: success ? undefined : { message: errorMessage, httpStatus, requestId },
      cliVersion: deps.identity.version,
      authMethod: deps.authMethod,
      params: extractParams(flags),
    });

    // Fire-and-forget — never block the CLI exit or mask errors
    localSink(event).catch(() => {});
    remoteSink(event).catch(() => {});
  }
}
