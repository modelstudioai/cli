/**
 * Shared HTTP request headers for all outgoing requests.
 *
 * Centralises the `x-dashscope-source-config`, `x-dashscope-openapisource`,
 * and `X-Dashscope-Service` headers so Bailian/DashScope API transports use
 * the same product identity. Generic npm, OSS, and result-file transfers
 * deliberately do not send this gateway-consumed metadata.
 */

import type { Identity } from "../config/schema.ts";

export const CHANNEL = "bailian-cli";

/**
 * `X-Dashscope-Service` attribution value for AIGC "auto"-mode MCP tool calls,
 * letting the gateway separate CLI-originated MCP generation traffic from the
 * default {@link CHANNEL}. Only the AIGC auto path opts in; every other request
 * (REST, upload, other MCP commands) keeps {@link CHANNEL}.
 */
export const MCP_CALL_SERVICE = "bailian-cli-call";

/** Static source identifier advertised to the DashScope/Bailian OpenAPI gateway. */
export const OPEN_API_SOURCE = "BailianCLI";

/** Marketplace / service attribution header (HTTP names are case-insensitive). */
export const DASHSCOPE_SERVICE_HEADER = "X-Dashscope-Service";

export type TrackingIdentity = Pick<Identity, "binName" | "version">;

export function sourceConfig(identity: TrackingIdentity): string {
  return JSON.stringify({
    channel: CHANNEL,
    tags: {
      t1: "public",
      t2: identity.binName,
      t3: identity.version,
    },
  });
}

/**
 * Tracking headers for Bailian/DashScope API requests. `service` overrides the
 * `X-Dashscope-Service` attribution value (default {@link CHANNEL}); AIGC
 * "auto"-mode MCP calls pass {@link MCP_CALL_SERVICE}.
 */
export function trackingHeaders(
  identity: TrackingIdentity,
  service: string = CHANNEL,
): Record<string, string> {
  return {
    "x-dashscope-source-config": sourceConfig(identity),
    "x-dashscope-openapisource": OPEN_API_SOURCE,
    [DASHSCOPE_SERVICE_HEADER]: service,
  };
}
