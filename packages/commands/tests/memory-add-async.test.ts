import { afterEach, expect, test, vi } from "vite-plus/test";
import { ExitCode } from "bailian-cli-core";
import memoryAdd from "../src/commands/memory/add.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(wait?: number) {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  const receipt = { request_id: "submit1", event_id: "event1", events: [] };
  const requestJson = vi.fn().mockResolvedValueOnce(receipt);
  const run = () =>
    memoryAdd.run({
      flags: {
        userId: "user1",
        content: "fact",
        workspaceId: "ws1",
        ...(wait === undefined ? {} : { wait }),
      },
      settings: { output: "json" },
      client: { requestJson },
    } as unknown as Parameters<typeof memoryAdd.run>[0]);
  return { requestJson, run, receipt, output: () => JSON.parse(chunks.join("")) };
}

test("wait 0 returns receipt without polling or leaking wait to API body", async () => {
  const fixture = setup(0);
  await fixture.run();
  expect(fixture.requestJson).toHaveBeenCalledTimes(1);
  expect(fixture.requestJson.mock.calls[0][0].body).toEqual({
    user_id: "user1",
    custom_content: "fact",
  });
  expect(fixture.output()).toEqual(fixture.receipt);
});

test("default wait polls all tasks and preserves JSON results", async () => {
  const fixture = setup();
  const events = [
    { status: "SUCCEEDED", result: [{ memory_node_id: "node1", content: "fact" }] },
    { status: "UNRECORDED" },
  ];
  fixture.requestJson.mockResolvedValueOnce({ events });
  await fixture.run();
  expect(fixture.requestJson).toHaveBeenCalledTimes(2);
  expect(fixture.requestJson.mock.calls[1][0]).toMatchObject({
    method: "GET",
    path: expect.stringContaining("/events/event1"),
  });
  expect(fixture.output()).toEqual({ ...fixture.receipt, events });
});

test("partial failure emits completed data and retains server failure details", async () => {
  const fixture = setup();
  const events = [
    { status: "SUCCEEDED", result: [{ memory_node_id: "node1" }] },
    { status: "FAILED", error_message: "backend detail" },
  ];
  fixture.requestJson.mockResolvedValueOnce({ events });
  await expect(fixture.run()).rejects.toMatchObject({
    exitCode: ExitCode.GENERAL,
    message: expect.stringContaining("backend detail"),
  });
  expect(fixture.output().events).toEqual(events);
});

test("finite wait exits TIMEOUT for pending tasks", async () => {
  vi.useFakeTimers();
  const fixture = setup(1);
  fixture.requestJson.mockResolvedValue({ events: [{ status: "RUNNING" }] });
  const result = expect(fixture.run()).rejects.toMatchObject({ exitCode: ExitCode.TIMEOUT });
  await vi.advanceTimersByTimeAsync(3000);
  await result;
});

test("transport errors propagate unchanged", async () => {
  const fixture = setup();
  const failure = new Error("service unavailable");
  fixture.requestJson.mockRejectedValueOnce(failure);
  await expect(fixture.run()).rejects.toBe(failure);
});
