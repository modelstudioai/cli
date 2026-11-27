import { classifyModelHost, hostnameOf } from "../config/model-endpoints.ts";
import type { AuthRequirement } from "../types/command.ts";

export type TelemetrySite = "domestic" | "international";

/** Coarse reason for site resolution; never includes raw hosts. */
export type TelemetrySiteReason =
  | "product-domestic"
  | "product-international"
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
  /**
   * Site declared by the product(s) the command actually called — the
   * service-plane table, not anything the user configured. For every non-console
   * auth domain this outranks all host-derived signals.
   */
  productSite?: TelemetrySite;
  /** Origin of the last recorded request (Client.url(), upload, absolute paths). */
  lastResolvedOrigin?: string;
  /** Model-domain base URL (or its host). */
  baseUrl?: string;
  /** baseUrl is the built-in default, not a user signal. */
  baseUrlIsDefault?: boolean;
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
 * Resolve the AEM reporting site. The product decides first: a service plane
 * the CLI only ever serves domestically reports domestic no matter which base
 * URL is configured (issue #349). Console keeps the account-site axis because
 * for that gateway the account site *is* the product site. Only when there is
 * no product verdict do user-side signals decide: consoleSite for console,
 * model host/region for apiKey/openapi, OR of both for none.
 */
export function resolveTelemetrySite(input: ResolveTelemetrySiteInput): TelemetrySiteResolution {
  if (input.auth === "console") {
    if (input.consoleSite === "international") {
      return { site: "international", siteReason: "positive-international" };
    }
    if (input.consoleSite === "domestic") {
      return { site: "domestic", siteReason: "positive-domestic" };
    }
    return { site: "domestic", siteReason: "default-fallback" };
  }

  if (input.productSite) {
    return {
      site: input.productSite,
      siteReason: input.productSite === "domestic" ? "product-domestic" : "product-international",
    };
  }

  if (input.auth === "apiKey" || input.auth === "openapi") {
    return classifyFromModelOrigin(input);
  }

  // auth: none — OR
  if (input.consoleSite === "international") {
    return { site: "international", siteReason: "positive-international" };
  }
  const modelResolution = classifyFromModelOrigin(input);
  if (modelResolution.site === "international") {
    return modelResolution;
  }
  if (input.consoleSite === "domestic") {
    return { site: "domestic", siteReason: "positive-domestic" };
  }
  return modelResolution;
}

function classifyFromModelOrigin(input: ResolveTelemetrySiteInput): TelemetrySiteResolution {
  const baseHost = hostnameOf(input.baseUrl);
  const originHost = hostnameOf(input.lastResolvedOrigin);
  // A recorded origin that is simply the shared base URL carries no signal
  // beyond `baseUrl`, so it must not promote a built-in default into a positive
  // user choice. Only a *different* origin — an absolute workspace URL or a
  // service-supplied default — outranks the base URL here.
  const distinctOriginHost = originHost && originHost !== baseHost ? originHost : undefined;
  const host = distinctOriginHost ?? (input.baseUrlIsDefault ? undefined : baseHost);
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
