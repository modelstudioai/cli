/**
 * Service-plane attribution table for telemetry site routing.
 *
 * The reporting site follows the **product**, not the domain the user happened
 * to configure: a plane the CLI only ever serves from the mainland workspace
 * gateway is domestic even when `DASHSCOPE_BASE_URL` points at an
 * international host (issue #349). Planes marked `follow` carry no product
 * verdict — there the resolved host decides, which is the pre-existing
 * behaviour for the shared model gateway and for planes that honour an
 * explicit base URL override.
 *
 * This table is classification only. It must never influence which URL a
 * command requests; endpoint routing stays owned by `endpoints.ts`.
 *
 * Invariant: classification looks at the request pathname only, never the
 * host. That is sound because every plane below is reached through an absolute
 * URL the CLI builds itself — `workspaceEndpoint()` pins the mainland workspace
 * host, and the custom-model import endpoint hardcodes the public mainland host
 * — so no command can put one of these paths on another origin. The guard test
 * in `tests/telemetry-service-planes.test.ts` keeps that true. A plane whose
 * host a user may override (`--base-url`, region flags) is therefore declared
 * `follow`, not `domestic`.
 */

export type PlaneSite = "domestic" | "international" | "follow";

/** Plane sites that carry a product verdict. */
export type ProductSite = Exclude<PlaneSite, "follow">;

export interface ServicePlane {
  /** Stable identifier; consumed by the coverage guard test and the telemetry docs. */
  key: string;
  site: PlaneSite;
  /** Path-segment prefixes, matched longest-first. A trailing slash matches descendants. */
  prefixes: readonly string[];
}

export const SERVICE_PLANES: readonly ServicePlane[] = [
  {
    key: "rag-workspace",
    // Knowledge base admin plane, data center, knowledge search and knowledge
    // chat. `workspaceEndpoint()` pins these to
    // <workspace>.cn-beijing.maas.aliyuncs.com and ignores the configured base
    // URL entirely, so the product is domestic by construction. Flip this to
    // "follow" if the plane ever ships outside the mainland.
    site: "domestic",
    prefixes: ["/api/v1/indices/", "/api/v1/connector/", "/api/v2/apps/knowledge/"],
  },
  {
    key: "memory",
    // Long-term memory v2 shares the mainland workspace gateway.
    site: "domestic",
    prefixes: ["/api/v2/apps/memory/"],
  },
  {
    key: "parsex",
    // Defaults to the mainland workspace host, but --base-url /
    // DASHSCOPE_BASE_URL is an explicit supported override, so the host in use
    // decides.
    site: "follow",
    prefixes: ["/api/v2/apps/parse-x/", "/api/v2/apps/pre-parse-x/"],
  },
  {
    key: "agentstudio",
    // AgentStudio control planes (sandbox, security center, workspace files)
    // default to the mainland workspace host and accept a --base-url override.
    site: "follow",
    prefixes: ["/api/v1/agentstudio/"],
  },
  {
    key: "mcp",
    site: "follow",
    prefixes: ["/api/v1/mcp/servers", "/api/v1/mcps/"],
  },
  {
    key: "cloud-skill",
    site: "follow",
    prefixes: ["/api/v1/skills"],
  },
  {
    key: "custom-model-import",
    // `CUSTOM_MODEL_IMPORT_ENDPOINT` hardcodes the public mainland DashScope
    // host because workspace hosts answer HTTP 404 for this API family. The
    // product is mainland-only even when the credential's base URL is
    // international, so the verdict comes from the product, not the host.
    site: "domestic",
    prefixes: ["/api/v1/custom_models/"],
  },
];

// Longest prefix first so a specific namespace wins over a broader one.
const PREFIX_ENTRIES = SERVICE_PLANES.flatMap((plane) =>
  plane.prefixes.map((prefix) => ({
    prefix,
    descendants: prefix.endsWith("/") ? prefix : prefix + "/",
    plane,
  })),
).sort((left, right) => right.prefix.length - left.prefix.length);

/**
 * Identify the service plane a request URL belongs to. Total function: an
 * unparseable URL or a path outside the table returns undefined, which means
 * "no product verdict" — never an error, because telemetry must not be able to
 * break a business request.
 */
export function classifyServicePlane(requestUrl: string): ServicePlane | undefined {
  let pathname: string;
  try {
    pathname = new URL(requestUrl).pathname;
  } catch {
    return undefined;
  }
  return PREFIX_ENTRIES.find(
    ({ prefix, descendants }) => pathname === prefix || pathname.startsWith(descendants),
  )?.plane;
}

/**
 * Product verdict for the planes a command touched. Fixed planes decide the
 * site and `follow` planes contribute nothing. If two fixed planes ever
 * disagree, domestic wins — the same conservative default the host classifier
 * already uses for unknown hosts.
 */
export function productSiteOf(planes: Iterable<ServicePlane>): ProductSite | undefined {
  const verdicts = new Set<ProductSite>();
  for (const plane of planes) {
    if (plane.site !== "follow") verdicts.add(plane.site);
  }
  if (verdicts.has("domestic")) return "domestic";
  if (verdicts.has("international")) return "international";
  return undefined;
}
