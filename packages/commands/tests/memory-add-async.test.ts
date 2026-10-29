import { createOutputReporter } from "bailian-cli-runtime";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { ExitCode, type LocalizedText } from "bailian-cli-core";
import memoryAdd from "../src/commands/memory/add.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(
  wait?: number,
  display: { output?: "text" | "json"; quiet?: boolean; verbose?: boolean } = {},
) {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  let stderr = "";
  const settings = {
    output: display.output ?? "json",
    quiet: display.quiet ?? false,
    verbose: display.verbose ?? false,
  };
  const reporter = createOutputReporter({
    settings,
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
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
      settings,
      output: reporter.output,
      localize: (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
      client: { requestJson },
    } as unknown as Parameters<typeof memoryAdd.run>[0]);
  return {
    requestJson,
    run,
    receipt,
    output: () => JSON.parse(chunks.join("")),
    stdout: () => chunks.join(""),
    stderr: () => stderr,
    reportError: (error: unknown) => reporter.error(error),
  };
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
  await vi.advanceTimersByTimeAsync(1000);
  await result;
});

test("transport errors propagate unchanged", async () => {
  const fixture = setup();
  const failure = new Error("service unavailable");
  fixture.requestJson.mockRejectedValueOnce(failure);
  await expect(fixture.run()).rejects.toBe(failure);
});

test("default wait rejects a receipt without event ID and never resubmits", async () => {
  const fixture = setup();
  delete (fixture.receipt as { event_id?: string }).event_id;
  await expect(fixture.run()).rejects.toMatchObject({
    exitCode: ExitCode.GENERAL,
    message: expect.stringContaining("event_id"),
  });
  expect(fixture.requestJson).toHaveBeenCalledTimes(1);
  expect(fixture.output()).toEqual(fixture.receipt);
});

test.each([Infinity, NaN, -1])("wait rejects an invalid polling budget: %s", (wait) => {
  expect(
    memoryAdd.validate?.({ userId: "user1", content: "fact", wait } as Parameters<
      NonNullable<typeof memoryAdd.validate>
    >[0]),
  ).toMatch(/--wait/);
});

const completionMatrix = (["text", "json"] as const).flatMap((output) =>
  [false, true].flatMap((quiet) =>
    [false, true].flatMap((verbose) =>
      [false, true].map((partialFailure) => ({ output, quiet, verbose, partialFailure })),
    ),
  ),
);

test.each(completionMatrix)(
  "completion retains full output: $output q=$quiet v=$verbose partial=$partialFailure",
  async ({ partialFailure, ...display }) => {
    const fixture = setup(undefined, display);
    const events = [
      {
        resource_type: "memory",
        resource_id: "project1",
        status: "SUCCEEDED",
        result: [{ memory_node_id: "node1", content: "fact", event: "ADD", extra: "preserved" }],
      },
      partialFailure
        ? { resource_type: "user_profile", status: "FAILED", error_message: "backend detail" }
        : { resource_type: "user_profile", status: "UNRECORDED" },
    ];
    fixture.requestJson.mockResolvedValueOnce({ events });
    let exitCode = 0;
    try {
      await fixture.run();
    } catch (error) {
      exitCode = fixture.reportError(error);
    }
    expect(exitCode).toBe(partialFailure ? ExitCode.GENERAL : 0);
    expect(fixture.requestJson).toHaveBeenCalledTimes(2);
    if (display.output === "json") {
      // Parse the whole stream, so repeated results or text prefixes fail.
      expect(fixture.output()).toEqual({ ...fixture.receipt, events });
      const diagnostics = fixture.stderr().trim()
        ? fixture
            .stderr()
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [];
      expect(diagnostics.filter((record) => record.error)).toHaveLength(partialFailure ? 1 : 0);
      expect(diagnostics.filter((record) => record.debug)).toHaveLength(display.verbose ? 1 : 0);
      if (display.verbose) {
        expect(diagnostics.find((record) => record.debug).debug).toMatchObject({
          code: "MEMORY_EXTRACTION_POLL",
          details: { event_id: "event1", round: 1 },
        });
      }
      if (partialFailure) {
        expect(diagnostics.find((record) => record.error).error.message).toContain(
          "backend detail",
        );
      }
    } else {
      expect(fixture.stdout()).toBe(
        partialFailure ? "[ADD] node1 fact\n" : "[ADD] node1 fact\nuser_profile: UNRECORDED\n",
      );
      expect(
        fixture.stderr().includes("MEMORY_EXTRACTION_POLL") ||
          fixture.stderr().includes("Polling memory extraction"),
      ).toBe(display.verbose);
      if (partialFailure) expect(fixture.stderr()).toContain("backend detail");
    }
  },
);
