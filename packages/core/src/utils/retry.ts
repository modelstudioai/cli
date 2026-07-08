import { BailianError } from "../errors/base.ts";

export interface RetryOptions {
  /** Max attempts (default 3). */
  attempts?: number;
  /** Predicate deciding whether to retry on error. Defaults to skipping non-retryable 4xx. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Base delay in ms for 429 backoff; grows exponentially, capped at 10s. 0 disables. */
  backoffBaseMs?: number;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 10_000;

/**
 * Default retry policy: non-retryable HTTP errors (4xx except 408 request-timeout
 * and 429 rate-limit) throw immediately — retrying an auth failure or bad request
 * won't change the outcome and only wastes latency / amplifies QPS. 5xx, network,
 * timeout, and 429 are transient and retry.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof BailianError) {
    const status = error.api?.httpStatus;
    if (status !== undefined) {
      if (status === 408 || status === 429) return true;
      if (status >= 400 && status < 500) return false;
    }
    return true; // 5xx or unknown status
  }
  // network/abort/timeout errors — transient
  return true;
}

function is429(error: unknown): boolean {
  return error instanceof BailianError && error.api?.httpStatus === 429;
}

function backoffDelay(attempt: number, baseMs: number): number {
  // exponential: base * 2^(attempt-1), capped so a long retry chain doesn't stall the CLI
  return Math.min(baseMs * 2 ** (attempt - 1), BACKOFF_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` up to `attempts` times, returning the first successful result.
 * Re-throws the last error when all attempts fail.
 *
 * Error classification: non-retryable HTTP errors (4xx except 408/429) throw
 * immediately instead of wasting retries; 5xx/timeout/network/429 retry.
 * On 429, an exponential backoff (base 500ms, capped 10s) paces retries so
 * the CLI doesn't amplify rate-limit pressure against the API.
 *
 * `fn` receives the 1-based attempt index so callers can nudge the prompt
 * on retries (e.g. "your previous output was not valid JSON"). The second
 * arg accepts either an attempt count (for backward compat) or a full
 * RetryOptions object.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  optsOrAttempts: RetryOptions | number = DEFAULT_ATTEMPTS,
): Promise<T> {
  const opts = typeof optsOrAttempts === "number" ? { attempts: optsOrAttempts } : optsOrAttempts;
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const shouldRetry = opts.shouldRetry ?? isRetryable;
  const backoffBase = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      if (!shouldRetry(error, attempt)) break;
      if (is429(error)) {
        await sleep(backoffDelay(attempt, backoffBase));
      }
    }
  }
  throw lastError;
}
