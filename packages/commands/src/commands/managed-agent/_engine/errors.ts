import { UserError } from "@openagentpack/sdk";
import { type ApiErrorBody, BailianError, ExitCode, mapApiError } from "bailian-cli-core";

/**
 * Structural shape of the SDK's `ApiError` (thrown by provider clients on HTTP
 * 4xx/5xx). Matched on fields instead of `instanceof` because the installed SDK
 * version does not export the class yet, and structural matching keeps this
 * check stable across SDK versions either way.
 */
interface SdkApiErrorLike extends Error {
  statusCode: number;
  responseBody: string;
}

function isSdkApiError(error: Error): error is SdkApiErrorLike {
  const candidate = error as Partial<SdkApiErrorLike>;
  return typeof candidate.statusCode === "number" && typeof candidate.responseBody === "string";
}

/**
 * The SDK embeds the raw response body in its error message; recover the
 * structured fields (message / code / request_id) when the body is JSON so
 * `mapApiError` surfaces a clean server message plus api metadata. Non-JSON
 * bodies pass through verbatim as the message.
 */
function parseSdkResponseBody(raw: string): ApiErrorBody {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ApiErrorBody;
  } catch {
    /* non-JSON body */
  }
  return { message: raw.trim() || undefined };
}

/**
 * The SDK's session polling deadline surfaces as a plain `UserError` (no
 * dedicated timeout class as of SDK 0.3.x), so it is recognized by its stable
 * message shape: "Session did not complete within the timeout (N seconds)."
 * (session-runtime's assertNotTimedOut — the SDK's only timeout UserError).
 * It is a client-side wait limit, not a usage mistake → per bl's error
 * boundary it must exit TIMEOUT, not USAGE.
 */
function isSdkPollingTimeout(error: UserError): boolean {
  return /did not complete within the timeout/i.test(error.message);
}

/**
 * Run an SDK-backed operation, translating SDK error types into BailianError so
 * bl's error handler produces the right exit code and hint formatting.
 * SDK `UserError` → USAGE — except the polling-deadline UserError, which is a
 * client-side timeout → TIMEOUT with a wait-longer hint; SDK `ApiError`
 * (server HTTP error) → GENERAL via `mapApiError` (server message passed
 * through verbatim, with httpStatus/apiCode/requestId metadata for
 * --output json); fetch transport failures (`TypeError: fetch failed`) are
 * rethrown untouched so the runtime error handler maps them to NETWORK with an
 * errno-specific hint, matching the native client path; any other Error →
 * GENERAL (message passed through, per bl's "don't translate server errors"
 * boundary).
 */
export async function withAgentErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BailianError) throw error;
    if (error instanceof UserError) {
      if (isSdkPollingTimeout(error)) {
        throw new BailianError(
          error.message,
          ExitCode.TIMEOUT,
          // `bl` prefix is safe: agent commands ship on `bl` only.
          "The session may still be running — check `bl managed-agent session get --session-id <id>` or `session events`.",
        );
      }
      throw new BailianError(error.message, ExitCode.USAGE);
    }
    if (error instanceof Error && isSdkApiError(error)) {
      throw mapApiError(error.statusCode, parseSdkResponseBody(error.responseBody));
    }
    // DNS/TCP/TLS failures from the SDK's fetch: keep the original TypeError so
    // the runtime error handler classifies it as NETWORK (exit 6) + errno hint.
    if (error instanceof TypeError && error.message === "fetch failed") throw error;
    if (error instanceof Error) throw new BailianError(error.message, ExitCode.GENERAL);
    throw error;
  }
}
