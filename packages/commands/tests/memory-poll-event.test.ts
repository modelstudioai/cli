import { expect, test } from "vite-plus/test";
import type { Client, MemoryEvent, MemoryEventResponse } from "bailian-cli-core";
import {
  isMemoryEventSuccess,
  isMemoryEventTerminal,
  pollMemoryEvents,
} from "../src/commands/memory/poll-event.ts";

function eventWith(status: string, resourceType = "observation"): MemoryEvent {
  return { event_id: "ev_1", status, resource_type: resourceType };
}

/** Replays canned responses; the last one repeats so timeout loops never starve. */
function mockClient(responses: MemoryEventResponse[]): { client: Client; calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  const client = {
    async requestJson(opts: { path: string }) {
      calls.push(opts.path);
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    },
  };
  return { client: client as unknown as Client, calls };
}

/** Virtual clock: sleep advances `current`, so budgets are deterministic. */
function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: async (milliseconds: number) => {
      current += milliseconds;
    },
    get current() {
      return current;
    },
  };
}

const BASE_OPTIONS = {
  workspaceId: "ws_1",
  eventId: "ev_1",
  timeoutMs: 120_000,
  intervalMs: 3_000,
} as const;

test("pollMemoryEvents builds the workspace event URL and stops at terminal statuses", async () => {
  const { client, calls } = mockClient([
    {
      request_id: "r1",
      events: [eventWith("SUCCEEDED"), eventWith("SUCCESS", "user_profile")],
    },
  ]);
  const result = await pollMemoryEvents({ ...BASE_OPTIONS, client });
  expect(result.timedOut).toBe(false);
  expect(result.events).toHaveLength(2);
  expect(calls).toEqual([
    "https://ws_1.cn-beijing.maas.aliyuncs.com/api/v2/apps/memory/events/ev_1",
  ]);
});

test("pollMemoryEvents polls through PENDING/RUNNING and reports every round", async () => {
  const clock = fakeClock();
  const { client, calls } = mockClient([
    { request_id: "r1", events: [eventWith("PENDING")] },
    { request_id: "r2", events: [eventWith("RUNNING")] },
    { request_id: "r3", events: [eventWith("SUCCEEDED")] },
  ]);
  const rounds: number[] = [];
  const result = await pollMemoryEvents({
    ...BASE_OPTIONS,
    client,
    sleep: clock.sleep,
    now: clock.now,
    onPoll: (round) => rounds.push(round),
  });
  expect(result.timedOut).toBe(false);
  expect(result.events[0]?.status).toBe("SUCCEEDED");
  expect(rounds).toEqual([1, 2, 3]);
  expect(calls).toHaveLength(3);
  expect(clock.current).toBe(6_000);
});

test("pollMemoryEvents reports timeout with the last pending snapshot", async () => {
  const clock = fakeClock();
  const { client, calls } = mockClient([{ request_id: "r1", events: [eventWith("PENDING")] }]);
  const result = await pollMemoryEvents({
    ...BASE_OPTIONS,
    client,
    timeoutMs: 9_000,
    sleep: clock.sleep,
    now: clock.now,
  });
  expect(result.timedOut).toBe(true);
  expect(result.events[0]?.status).toBe("PENDING");
  // t=0 poll → t=3000 poll → t=6000 poll → t=9000 poll → budget spent
  expect(calls).toHaveLength(4);
});

test("pollMemoryEvents treats FAILED and UNRECORDED as terminal", async () => {
  const { client, calls } = mockClient([
    {
      request_id: "r1",
      events: [
        eventWith("SUCCEEDED"),
        eventWith("FAILED", "user_profile"),
        eventWith("UNRECORDED", "skill"),
      ],
    },
  ]);
  const result = await pollMemoryEvents({ ...BASE_OPTIONS, client });
  expect(result.timedOut).toBe(false);
  expect(result.events).toHaveLength(3);
  expect(calls).toHaveLength(1);
});

test("pollMemoryEvents returns immediately on an empty events list", async () => {
  const { client, calls } = mockClient([{ request_id: "r1", events: [] }]);
  const result = await pollMemoryEvents({ ...BASE_OPTIONS, client });
  expect(result.timedOut).toBe(false);
  expect(result.events).toEqual([]);
  expect(calls).toHaveLength(1);
});

test("event status predicates accept the SUCCESS wire variant", () => {
  expect(isMemoryEventTerminal("SUCCEEDED")).toBe(true);
  expect(isMemoryEventTerminal("SUCCESS")).toBe(true);
  expect(isMemoryEventTerminal("FAILED")).toBe(true);
  expect(isMemoryEventTerminal("UNRECORDED")).toBe(true);
  expect(isMemoryEventTerminal("PENDING")).toBe(false);
  expect(isMemoryEventTerminal("RUNNING")).toBe(false);
  expect(isMemoryEventTerminal(undefined)).toBe(false);
  expect(isMemoryEventSuccess("SUCCEEDED")).toBe(true);
  expect(isMemoryEventSuccess("SUCCESS")).toBe(true);
  expect(isMemoryEventSuccess("FAILED")).toBe(false);
  expect(isMemoryEventSuccess("UNRECORDED")).toBe(false);
});
