import {
  memoryEndpoint,
  memoryEventPath,
  type Client,
  type MemoryEvent,
  type MemoryEventResponse,
} from "bailian-cli-core";

/**
 * Terminal statuses for one async memory event.
 *
 * PENDING and RUNNING are non-terminal. SUCCEEDED is the verified success
 * status; SUCCESS remains a legacy compatibility spelling. FAILED and
 * UNRECORDED are terminal.
 */
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "SUCCESS", "FAILED", "UNRECORDED"]);

/** Statuses that count as a successful extraction (SUCCESS = wire variant). */
const SUCCESS_STATUSES = new Set(["SUCCEEDED", "SUCCESS"]);

export function isMemoryEventTerminal(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status);
}

export function isMemoryEventSuccess(status: string | undefined): boolean {
  return status !== undefined && SUCCESS_STATUSES.has(status);
}

/**
 * Resolve after `milliseconds`, rejecting early if `signal` aborts (Ctrl-C).
 * Cleans up its timer + listener so nothing leaks between polls.
 */
function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface PollMemoryEventsOptions {
  client: Client;
  workspaceId: string;
  eventId: string;
  /** Total polling budget in milliseconds; the loop exits once it is spent. */
  timeoutMs: number;
  /** Delay between two GET /events/{id} calls. */
  intervalMs: number;
  signal?: AbortSignal;
  /** Invoked after every poll round (verbose progress output). */
  onPoll?: (round: number, events: MemoryEvent[]) => void;
  /** Injectable for tests. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Injectable for tests. */
  now?: () => number;
}

export interface PollMemoryEventsResult {
  /** True when the budget was spent while at least one event was still pending. */
  timedOut: boolean;
  /** Last observed event list (terminal, or the latest pending snapshot on timeout). */
  events: MemoryEvent[];
}

/**
 * Poll GET /events/{event_id} until every event reaches a terminal status or
 * the time budget is spent. Internal implementation of `memory add --wait`;
 * deliberately not exposed as a user command (design doc §2.2).
 *
 * HTTP failures propagate as-is (server errors are never translated). An empty
 * events list is treated as terminal to avoid waiting on a malformed response.
 */
export async function pollMemoryEvents(
  options: PollMemoryEventsOptions,
): Promise<PollMemoryEventsResult> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const url = memoryEndpoint(options.workspaceId, memoryEventPath(options.eventId));
  const startedAt = now();
  let events: MemoryEvent[] = [];
  let round = 0;

  for (;;) {
    const response = await options.client.requestJson<MemoryEventResponse>({
      path: url,
      method: "GET",
      signal: options.signal,
    });
    events = response.events ?? [];
    round += 1;
    options.onPoll?.(round, events);

    if (events.every((event) => isMemoryEventTerminal(event.status))) {
      return { timedOut: false, events };
    }
    if (now() - startedAt >= options.timeoutMs) {
      return { timedOut: true, events };
    }
    await sleep(options.intervalMs, options.signal);
  }
}
