import {
  classifyServicePlane,
  productSiteOf,
  type ProductSite,
  type ServicePlane,
} from "./service-planes.ts";

/**
 * Bound the distinct-origin list so a pathological retry loop cannot grow it
 * without limit. Only the debug/inspection list is capped — `lastOrigin` and
 * the plane verdict are always kept up to date.
 */
const MAX_RECORDED_ORIGINS = 8;

/**
 * Mutable record of the network surfaces one command run actually touched.
 *
 * Created once per run and handed to every `Client` through `ClientDeps` **by
 * reference**, so Clients derived from another one keep writing into the same
 * record — `Client.withConsoleSwitchAgent()` builds a new `Client`, and the
 * outer telemetry stage only ever reads the one attached to the run context.
 * Without a shared record that derived client's origins were invisible, which
 * is the same class of silent misattribution as passing an absolute URL
 * through `request({ path })` without recording it.
 */
export interface RequestSignals {
  /** Distinct origins in first-seen order, capped for inspection only. */
  readonly origins: readonly string[];
  /** Distinct service planes touched, in first-seen order. */
  readonly planes: readonly ServicePlane[];
  /** Best-effort: never throws, ignores anything without a valid origin. */
  record(requestUrl: string): void;
  /**
   * Origin of the most recent recorded request, overwritten on every record.
   * Kept separate from the capped `origins` list so a long multi-origin run
   * cannot hide the origin that actually decides the site.
   */
  lastOrigin(): string | undefined;
  /** Product verdict from the fixed service planes touched so far. */
  productSite(): ProductSite | undefined;
}

export function createRequestSignals(): RequestSignals {
  const origins = new Set<string>();
  const planes = new Set<ServicePlane>();
  let lastOrigin: string | undefined;
  return {
    get origins(): readonly string[] {
      return [...origins];
    },
    get planes(): readonly ServicePlane[] {
      return [...planes];
    },
    record(requestUrl: string): void {
      let origin: string;
      try {
        origin = new URL(requestUrl).origin;
      } catch {
        return;
      }
      if (!origin || origin === "null") return;
      lastOrigin = origin;
      if (origins.has(origin) || origins.size < MAX_RECORDED_ORIGINS) origins.add(origin);
      const plane = classifyServicePlane(requestUrl);
      if (plane) planes.add(plane);
    },
    lastOrigin(): string | undefined {
      return lastOrigin;
    },
    productSite(): ProductSite | undefined {
      return productSiteOf(planes);
    },
  };
}
