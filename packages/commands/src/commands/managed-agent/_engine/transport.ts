import * as sdk from "@openagentpack/sdk";
import {
  createInstrumentedFetch,
  type FetchImplementation,
  type Identity,
  type Settings,
} from "bailian-cli-core";

/** The slice of CommandContext the transport wrapper needs (UA identity + verbose). */
export interface HostContext {
  identity: Identity;
  settings: Settings;
}

let installed = false;

/**
 * Route the SDK's provider-client requests through the CLI's instrumented
 * fetch (UA, host-gated tracking headers, --verbose logging). Feature-detected:
 * `setDefaultFetch` landed after @openagentpack/sdk 0.1.0 — on older versions
 * this is a silent no-op and the SDK keeps using the global fetch as before.
 */
export function installSdkTransport(host: HostContext): void {
  if (installed) return;
  const setDefaultFetch = (sdk as Record<string, unknown>).setDefaultFetch;
  if (typeof setDefaultFetch !== "function") return;
  (setDefaultFetch as (fetchImpl: FetchImplementation) => void)(createInstrumentedFetch(host));
  installed = true;
}
