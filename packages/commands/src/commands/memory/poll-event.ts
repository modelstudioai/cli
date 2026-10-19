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
      reject(signal?.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
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
 * HTTP failures propagate as-is (server errors are never translated). Empty
 * events do not prove completion and are polled until the budget expires.
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

  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const timeoutReason = new Error("Memory polling budget exhausted");
  const onExternalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  // Node timers overflow above 2^31 - 1 ms; re-arm long budgets in safe chunks.
  const scheduleDeadline = (): ReturnType<typeof setTimeout> => {
    const remainingMs = options.timeoutMs - (now() - startedAt);
    return setTimeout(
      () => {
        if (now() - startedAt >= options.timeoutMs) controller.abort(timeoutReason);
        else timer = scheduleDeadline();
      },
      Math.min(Math.max(remainingMs, 0), 2_147_483_647),
    );
  };
  let timer = scheduleDeadline();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });

  const poll = async (): Promise<PollMemoryEventsResult> => {
    for (;;) {
      controller.signal.throwIfAborted();
      if (now() - startedAt >= options.timeoutMs) return { timedOut: true, events };
      const response = await options.client.requestJson<MemoryEventResponse>({
        path: url,
        method: "GET",
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      events = response.events ?? [];
      round += 1;
      options.onPoll?.(round, events);

      if (events.length > 0 && events.every((event) => isMemoryEventTerminal(event.status))) {
        return { timedOut: false, events };
      }
      const remainingMs = options.timeoutMs - (now() - startedAt);
      if (remainingMs <= 0) return { timedOut: true, events };
      await sleep(Math.min(options.intervalMs, remainingMs), controller.signal);
    }
  };

  try {
    return await Promise.race([poll(), aborted]);
  } catch (error) {
    if (controller.signal.reason === timeoutReason) return { timedOut: true, events };
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
