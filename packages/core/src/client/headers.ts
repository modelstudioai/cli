/**
 * Shared HTTP request headers for all outgoing requests.
 *
 * Centralises the `x-dashscope-source-config` header so Bailian/DashScope API
 * transports use the same product identity. Generic npm, OSS, and result-file
 * transfers deliberately do not send this gateway-consumed metadata.
 */

import type { Identity } from "../config/schema.ts";

export const CHANNEL = "bailian-cli";

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

/** Tracking headers for Bailian/DashScope API requests. */
export function trackingHeaders(identity: TrackingIdentity): Record<string, string> {
  return {
    "x-dashscope-source-config": sourceConfig(identity),
  };
}
