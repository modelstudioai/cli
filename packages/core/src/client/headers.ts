/**
 * Shared HTTP request headers for all outgoing requests.
 *
 * Centralises the `x-dashscope-source-config` header so every fetch call
 * (both via the central http client and the bypass paths) uses the
 * same values from a single source of truth.
 */

export const CHANNEL = "bailian-cli";

export const TAGS = { t1: "public", t2: "" };

export const SOURCE_CONFIG = JSON.stringify({
  channel: CHANNEL,
  tags: TAGS,
});

/** Standard tracking headers required on every outbound request. */
export function trackingHeaders(): Record<string, string> {
  return {
    "x-dashscope-source-config": SOURCE_CONFIG,
  };
}
