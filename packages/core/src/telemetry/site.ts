import { classifyModelHost, hostnameOf } from "../config/model-endpoints.ts";
import type { AuthRequirement } from "../types/command.ts";

export type TelemetrySite = "domestic" | "international";

/** Coarse reason for site resolution; never includes raw hosts. */
export type TelemetrySiteReason =
  | "positive-domestic"
  | "positive-international"
  | "default-fallback"
  | "unknown-host";

export interface TelemetrySiteResolution {
  site: TelemetrySite;
  siteReason: TelemetrySiteReason;
}

export interface ResolveTelemetrySiteInput {
  auth: AuthRequirement;
  consoleSite?: "domestic" | "international";
  /** Origin recorded from Client.url() / upload defaultBaseUrl paths. */
  lastResolvedOrigin?: string;
  /** Model-domain base URL (or its host). */
  baseUrl?: string;
}

export interface TelemetryRemoteTarget {
  site: TelemetrySite;
  endpoint: string;
  pid: string;
}

const REMOTE_TARGETS: Record<TelemetrySite, TelemetryRemoteTarget> = {
  domestic: {
    site: "domestic",
    endpoint: "gm.mmstat.com",
    pid: "bailian-cli-node",
  },
  international: {
    site: "international",
    endpoint: "sg.mmstat.com",
    pid: "bailian-cli-node-intl",
  },
};

export function telemetryRemoteTarget(site: TelemetrySite): TelemetryRemoteTarget {
  return REMOTE_TARGETS[site];
}

/**
 * Resolve AEM reporting site (D4=B): console → consoleSite;
 * apiKey/openapi → model host/region; none → OR of both.
 */
export function resolveTelemetrySite(input: ResolveTelemetrySiteInput): TelemetrySiteResolution {
  if (input.auth === "console") {
    if (input.consoleSite === "international") {
      return { site: "international", siteReason: "positive-international" };
    }
    return { site: "domestic", siteReason: "default-fallback" };
  }

  if (input.auth === "apiKey" || input.auth === "openapi") {
    return classifyFromModelOrigin(input.lastResolvedOrigin, input.baseUrl);
  }

  // auth: none — OR
  if (input.consoleSite === "international") {
    return { site: "international", siteReason: "positive-international" };
  }
  return classifyFromModelOrigin(input.lastResolvedOrigin, input.baseUrl);
}

function classifyFromModelOrigin(
  lastResolvedOrigin: string | undefined,
  baseUrl: string | undefined,
): TelemetrySiteResolution {
  const host = hostnameOf(lastResolvedOrigin) ?? hostnameOf(baseUrl);
  if (!host) {
    return { site: "domestic", siteReason: "default-fallback" };
  }
  const classification = classifyModelHost(host);
  switch (classification) {
    case "domestic":
      return { site: "domestic", siteReason: "positive-domestic" };
    case "international":
      return { site: "international", siteReason: "positive-international" };
    case "unknown":
      return { site: "domestic", siteReason: "unknown-host" };
    default: {
      const _exhaustive: never = classification;
      return _exhaustive;
    }
  }
}
