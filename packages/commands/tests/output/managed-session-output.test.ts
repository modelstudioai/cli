import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import type { CollectedSessionEvents, ProviderSessionEvent } from "@openagentpack/sdk";
import { buildSettings, ExitCode, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import {
  streamAndRenderEvents,
  renderCollectedEvents,
} from "../../src/commands/managed-agent/_engine/session-render.ts";

const displays = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
let rawOut = "",
  rawErr = "";
beforeEach(() => {
  rawOut = "";
  rawErr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    rawOut += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    rawErr += String(chunk);
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());
function context(display: (typeof displays)[number]) {
  const settings = buildSettings({
    flags: { output: display.format, quiet: display.quiet, verbose: display.verbose },
    env: {},
    file: {},
  });
  const localize = (message: LocalizedText) =>
    typeof message === "string" ? message : message["en-US"];
  let stdout = "",
    stderr = "";
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  return {
    ctx: { settings, localize, output: reporter.output },
    result: vi.spyOn(reporter.output, "result"),
    read: () => ({ stdout, stderr }),
  };
}
const events: ProviderSessionEvent[] = [
  { raw: {}, raw_type: "fixture-event", type: "message", role: "user", content: "user echo" },
  { raw: {}, raw_type: "fixture-event", type: "thinking", content: "hidden thinking" },
  { raw: {}, raw_type: "fixture-event", type: "status", status: "running" },
  { raw: {}, raw_type: "fixture-event", type: "tool_use", tool_name: "fixture-tool" },
  { raw: {}, raw_type: "fixture-event", type: "tool_result", content: "fixture tool result" },
  { raw: {}, raw_type: "fixture-event", type: "message", role: "assistant", content: "Hello " },
  { raw: {}, raw_type: "fixture-event", type: "message", role: "assistant", content: "fixture" },
  { raw: {}, raw_type: "fixture-event", type: "status", status: "completed" },
];
async function* stream(selected: ProviderSessionEvent[]) {
  for (const event of selected) yield event;
}
const identity = { session_id: "session-fixture", provider: "bailian", agent: "assistant" };
for (const mode of ["stream", "collected"] as const) {
  test.each(displays)(
    `${mode}: one final event envelope and quiet only hides process hints %j`,
    async (display) => {
      const current = context(display);
      if (mode === "stream") await streamAndRenderEvents(current.ctx, stream(events), identity);
      else
        renderCollectedEvents(
          current.ctx,
          {
            terminalStatus: "completed",
            result: { events, has_more: false, next_page: "opaque-fixture" },
          } as CollectedSessionEvents,
          identity,
        );
      expect(current.result).toHaveBeenCalledTimes(1);
      expect(rawErr).toBe("");
      if (display.format === "json") {
        expect(rawOut).toBe("");
        const result = JSON.parse(current.read().stdout);
        expect(result).toMatchObject(identity);
        expect(result.events).toHaveLength(events.length);
        expect(result.events).toContainEqual({
          type: "fixture-event",
          role: "assistant",
          content: [{ type: "text", text: "Hello " }],
          metadata: { display_bucket: "message" },
        });
        if (mode === "collected")
          expect(result).toMatchObject({ has_more: false, next_page: "opaque-fixture" });
        expect(current.read().stderr).toBe("");
      } else {
        expect(rawOut + current.read().stdout).toBe("Hello fixture\n");
        if (display.quiet) expect(current.read().stderr).toBe("");
        else expect(current.read().stderr).toContain("fixture-tool");
        expect(rawOut + current.read().stdout).not.toContain("user echo");
      }
    },
  );
  test.each(displays)(
    `${mode}: server failure keeps report, warning and original terminal error %j`,
    async (display) => {
      const current = context(display);
      const failed: ProviderSessionEvent[] = [
        {
          raw: {},
          raw_type: "fixture-event",
          type: "error",
          content: "原始服务错误 fixture quota",
        },
        { raw: {}, raw_type: "fixture-event", type: "status", status: "failed" },
      ];
      const run = () =>
        mode === "stream"
          ? streamAndRenderEvents(current.ctx, stream(failed), identity)
          : renderCollectedEvents(
              current.ctx,
              {
                terminalStatus: "failed",
                result: { events: failed, has_more: false },
              } as CollectedSessionEvents,
              identity,
            );
      await expect(Promise.resolve().then(run)).rejects.toMatchObject({
        message: "原始服务错误 fixture quota",
        exitCode: ExitCode.GENERAL,
      });
      expect(current.result).toHaveBeenCalledTimes(1);
      expect(current.read().stderr).toContain("原始服务错误 fixture quota");
      expect(rawErr).toBe("");
      if (display.format === "json") {
        expect(JSON.parse(current.read().stdout)).toMatchObject(identity);
        for (const line of current.read().stderr.trim().split("\n"))
          expect(JSON.parse(line).warning.code).toBe("AGENT_SESSION_EVENT_ERROR");
      }
    },
  );
}
test.each(displays)(
  "interrupted stream preserves the accepted session id and original failure %j",
  async (display) => {
    const current = context(display);
    const failure = new Error("fixture iterator failure");
    async function* interrupted() {
      yield {
        raw: {},
        raw_type: "fixture-event",
        type: "message",
        role: "assistant",
        content: "partial",
      } as ProviderSessionEvent;
      throw failure;
    }
    await expect(streamAndRenderEvents(current.ctx, interrupted(), identity)).rejects.toBe(failure);
    expect(current.result).not.toHaveBeenCalled();
    expect(current.read().stderr).toContain("session-fixture");
    expect(rawErr).toBe("");
    if (display.format === "json") {
      expect(current.read().stdout + rawOut).toBe("");
      expect(JSON.parse(current.read().stderr).warning).toMatchObject({
        code: "AGENT_SESSION_INTERRUPTED",
        details: identity,
      });
    }
  },
);
