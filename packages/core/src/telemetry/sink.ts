import { appendFileSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir, ensureConfigDir } from "../config/paths.ts";
import {
  buildFirstInstallAemOptions,
  buildRemoteAemOptions,
  FIRST_INSTALL_EVENT_NAME,
  isFirstInstallEvent,
  type FirstInstallEvent,
  type TrackingEvent,
} from "./event.ts";
import { detectEnv } from "./env.ts";
import { ensureUid, loadUid } from "./uid.ts";
import { telemetryRemoteTarget, type TelemetrySite } from "./site.ts";
import Tracker from "../../lib/remote-telemetry/tracker.cjs";
import EventPlugin from "../../lib/remote-telemetry/event-plugin.cjs";

const TELEMETRY_FILE = () => join(getConfigDir(), "telemetry.jsonl");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Track in-flight remote sends so we can wait for them before process exit.
// The underlying tracker is fire-and-forget (fetch starts without holding the promise);
// without tracking, short commands or SIGINT can exit before the request hits the network.
// With `keepalive: true` in tracker.js, awaiting these promises best-effort delivers
// telemetry without blocking the main command path.
const SEND_TIMEOUT_MS = 1000;
interface PendingSend {
  controller: AbortController;
  promise: Promise<void>;
}
const inflightSends = new Set<PendingSend>();

interface RemoteSiteClient {
  client: {
    _sendAll?: () => void;
    send: (payload: string, options?: { signal?: AbortSignal }) => unknown;
  };
  sendEvent: (name: string, opts: Record<string, unknown>) => void;
}

/** One Tracker per telemetry site so domestic/intl never share pid/endpoint. */
const remoteBySite = new Map<TelemetrySite, RemoteSiteClient>();

/**
 * Construct the tracker on first remote report for a site so disabled telemetry
 * neither constructs the tracker nor creates the uid file. Fully synchronous; see ensureUid.
 */
function initRemoteForSite(site: TelemetrySite): RemoteSiteClient | undefined {
  const existing = remoteBySite.get(site);
  if (existing) return existing;
  try {
    const uid = ensureUid();
    const target = telemetryRemoteTarget(site);
    // `env` on the Tracker top-level config becomes a URL query param; AEM's
    // "environment" column (raw field `env`) reads it. Allowed values:
    // prod/pre/daily/dev. We currently use only prod/dev.
    // anonymous install id as `uid`, which AEM exposes as a dashboard field.
    // Cross-site uid/device_id stay shared (compliance-accepted).
    const client = new Tracker({
      pid: target.pid,
      endpoint: target.endpoint,
      env: detectEnv(),
      ...(uid ? { uid } : {}),
    });
    // Monkey-patch only this instance's `send` to collect each fetch promise.
    // Do not touch the prototype so other Tracker consumers stay unaffected.
    const originalSend = client.send.bind(client);
    client.send = function (payload: string) {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      deadline.unref?.();
      const pending: PendingSend = {
        controller,
        promise: Promise.resolve()
          .then(() => originalSend(payload, { signal: controller.signal }))
          .catch(() => {})
          .finally(() => {
            // Bun may resolve body.cancel() before stopping its underlying fetch.
            // Finish this send's private scope before removing its deadline.
            controller.abort();
            clearTimeout(deadline);
            inflightSends.delete(pending);
          }),
      };
      inflightSends.add(pending);
      return pending.promise;
    };
    const entry: RemoteSiteClient = {
      client,
      sendEvent: client.use(EventPlugin),
    };
    remoteBySite.set(site, entry);
    return entry;
  } catch {
    // Telemetry must never affect the CLI main flow
    return undefined;
  }
}

/**
 * Best-effort wait for all in-flight telemetry sends.
 *
 * 1. Call `_sendAll` on every site tracker to drain the debounce queue so events
 *    still in the 500ms merge window are pushed to the network immediately.
 * 2. Wait for sends within the budget; on timeout, cancel DNS/HTTP/body work.
 *
 * Telemetry must never block the CLI: callers should pass a short timeout
 * (e.g. 1000ms) and always race against it. Errors and timeouts are swallowed.
 */
export async function flushTelemetry(timeoutMs = 1000): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const entry of remoteBySite.values()) {
      try {
        if (typeof entry.client._sendAll === "function") {
          entry.client._sendAll();
        }
      } catch {
        // flush itself must never throw
      }
    }
    if (inflightSends.size === 0) return;
    await Promise.race([
      Promise.allSettled([...inflightSends].map((pending) => pending.promise)),
      new Promise<void>((resolve) => {
        deadline = setTimeout(() => {
          for (const pending of inflightSends) pending.controller.abort();
          resolve();
        }, timeoutMs);
        deadline.unref?.();
      }),
    ]);
  } catch {
    // Telemetry must never affect the CLI main flow
  } finally {
    clearTimeout(deadline);
  }
}

export async function localSink(event: TrackingEvent | FirstInstallEvent): Promise<void> {
  try {
    await ensureConfigDir();
    const path = TELEMETRY_FILE();

    try {
      const stat = statSync(path);
      if (stat.size > MAX_FILE_SIZE) {
        unlinkSync(path);
      }
    } catch {
      // File does not exist yet; ignore
    }

    // Read-only; remoteSink creates the file on first report.
    const uid = loadUid();
    appendFileSync(path, JSON.stringify(uid ? { ...event, uid } : event) + "\n", {
      mode: 0o600,
    });
  } catch {
    // Telemetry must never affect the CLI main flow
  }
}

/** Returns whether the event was queued. Callers must not await before this function enqueues. */
export async function remoteSink(event: TrackingEvent | FirstInstallEvent): Promise<boolean> {
  try {
    // first_install has no command/auth context; it always reports domestic (best-effort).
    const site: TelemetrySite = isFirstInstallEvent(event) ? "domestic" : (event.site ?? "domestic");
    const entry = initRemoteForSite(site);
    if (!entry) return false;
    if (isFirstInstallEvent(event)) {
      entry.sendEvent(FIRST_INSTALL_EVENT_NAME, buildFirstInstallAemOptions(event));
    } else {
      entry.sendEvent(event.command, buildRemoteAemOptions(event));
    }
    return true;
  } catch {
    // Telemetry must never affect the CLI main flow
    return false;
  }
}

/** Test-only: drop site trackers so the next remoteSink rebuilds them. */
export function resetRemoteTelemetryForTests(): void {
  remoteBySite.clear();
  inflightSends.clear();
}
