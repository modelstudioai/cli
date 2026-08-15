import { BailianError, ExitCode } from "bailian-cli-core";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import chatCommand from "../src/commands/text/chat.ts";
import {
  extractResponsesStreamDelta,
  extractResponsesText,
} from "../src/commands/text/responses.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function responsesStreamResponse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

async function runResponsesStream(events: unknown[]): Promise<BailianError | undefined> {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  try {
    await chatCommand.run({
      settings: { output: "json" },
      flags: {
        api: "responses",
        message: ["hello"],
        stream: true,
      },
      client: {
        request: async () => responsesStreamResponse(events),
      },
    } as never);
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(BailianError);
    return error as BailianError;
  }
}

describe("Responses output", () => {
  test("extracts only output_text from message items", () => {
    const text = extractResponsesText({
      id: "resp_1",
      object: "response",
      status: "completed",
      output: [
        { type: "reasoning", summary: [{ type: "summary_text", text: "thinking" }] },
        { type: "web_search_call", status: "completed" },
        { type: "message", content: [{ type: "output_text", text: "first" }] },
        {
          type: "message",
          content: [
            { type: "refusal", text: "ignored" },
            { type: "output_text", text: " second" },
          ],
        },
      ],
    });

    expect(text).toBe("first second");
  });

  test("extracts only response.output_text.delta stream events", () => {
    expect(extractResponsesStreamDelta({ type: "response.output_text.delta", delta: "hi" })).toBe(
      "hi",
    );
    expect(extractResponsesStreamDelta({ type: "response.web_search_call.completed" })).toBe("");
  });

  test("streaming response.completed finishes successfully", async () => {
    const error = await runResponsesStream([
      { type: "response.output_text.delta", sequence_number: 1, delta: "done" },
      {
        type: "response.completed",
        sequence_number: 2,
        response: {
          id: "resp_completed",
          object: "response",
          status: "completed",
          output: [],
          error: null,
          incomplete_details: null,
        },
      },
    ]);

    expect(error).toBeUndefined();
  });

  test("streaming response.failed throws the original service message", async () => {
    const error = await runResponsesStream([
      {
        type: "response.failed",
        sequence_number: 1,
        response: {
          id: "resp_failed",
          object: "response",
          status: "failed",
          output: [],
          error: { code: "quota_exceeded", message: "provider quota exceeded" },
        },
      },
    ]);

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("provider quota exceeded");
  });

  test("streaming response.incomplete exits non-zero with the service reason", async () => {
    const error = await runResponsesStream([
      {
        type: "response.incomplete",
        sequence_number: 1,
        response: {
          id: "resp_incomplete",
          object: "response",
          status: "incomplete",
          output: [],
          incomplete_details: { reason: "max_output_tokens" },
        },
      },
    ]);

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("Response incomplete: max_output_tokens");
  });

  test("stream ending before response.completed exits non-zero", async () => {
    const error = await runResponsesStream([
      { type: "response.output_text.delta", sequence_number: 1, delta: "partial" },
    ]);

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe(
      "Stream disconnected before completion: stream closed before response.completed.",
    );
  });
});
