import { appendFileSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir, ensureConfigDir } from "../config/paths.ts";
import { buildRemoteAemOptions, type TrackingEvent } from "./event.ts";
import { detectEnv } from "./env.ts";
import { ensureUid, loadUid } from "./uid.ts";
import Tracker from "../../lib/remote-telemetry/tracker.cjs";
import EventPlugin from "../../lib/remote-telemetry/event-plugin.cjs";

const TELEMETRY_FILE = () => join(getConfigDir(), "telemetry.jsonl");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

let remoteSendEvent: ((name: string, opts: Record<string, unknown>) => void) | undefined;

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
let remoteClient: any = undefined;
let remoteInitialized = false;

/**
 * Construct the tracker on first remote report so disabled telemetry neither
 * constructs the tracker nor creates the uid file. Fully synchronous; see ensureUid.
 */
function initRemote(): void {
  if (remoteInitialized) return;
  remoteInitialized = true;
  try {
    const uid = ensureUid();
    // `env` on the Tracker top-level config becomes a URL query param; AEM's
    // "environment" column (raw field `env`) reads it. Allowed values:
    // prod/pre/daily/dev. We currently use only prod/dev.
    // anonymous install id as `uid`, which AEM exposes as a dashboard field.
    const client = new Tracker({
      pid: "bailian-cli-node",
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
    remoteClient = client;
    remoteSendEvent = client.use(EventPlugin);
  } catch {
    // Telemetry must never affect the CLI main flow
  }
}

/**
 * Best-effort wait for all in-flight telemetry sends.
 *
 * 1. Call `_sendAll` to drain the tracker's debounce queue so events still in
 *    the 500ms merge window are pushed to the network immediately.
 * 2. Wait for sends within the budget; on timeout, cancel DNS/HTTP/body work.
 *
 * Telemetry must never block the CLI: callers should pass a short timeout
 * (e.g. 1000ms) and always race against it. Errors and timeouts are swallowed.
 */
export async function flushTelemetry(timeoutMs = 1000): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (remoteClient) {
      try {
        // Drain the debounce queue so events stuck in the 500ms merge window
        // are sent immediately (each send is appended to inflightSends).
        if (typeof remoteClient._sendAll === "function") {
          remoteClient._sendAll();
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

export async function localSink(event: TrackingEvent): Promise<void> {
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

export async function remoteSink(event: TrackingEvent): Promise<void> {
  try {
    initRemote();
    if (!remoteSendEvent) return;
    remoteSendEvent(event.command, buildRemoteAemOptions(event));
  } catch {
    // Telemetry must never affect the CLI main flow
  }
}
