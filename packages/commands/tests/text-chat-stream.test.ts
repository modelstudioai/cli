import { buildSettings, BailianError, ExitCode } from "bailian-cli-core";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import chatCommand from "../src/commands/text/chat.ts";
import { withCommandOutput } from "./output/command-context.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function chatStreamResponse(events: Array<string | Record<string, unknown>>): Response {
  const body = events
    .map((event) => {
      if (typeof event === "string") {
        if (event.startsWith("event:")) return `${event}\n\n`;
        return `data: ${event}\n\n`;
      }
      return `data: ${JSON.stringify(event)}\n\n`;
    })
    .join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function chunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
): Record<string, unknown> {
  return {
    id: "chatcmpl-fixture",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

async function runChatStream(options: {
  events: Array<string | Record<string, unknown>>;
  output?: "json" | "text";
  captureStdout?: boolean;
}): Promise<{ error?: BailianError; stdout: string }> {
  let stdout = "";
  if (options.captureStdout !== false) {
    vi.spyOn(process.stdout, "write").mockImplementation((chunkValue) => {
      stdout += typeof chunkValue === "string" ? chunkValue : String(chunkValue);
      return true;
    });
  } else {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  }

  try {
    await chatCommand.run(
      withCommandOutput({
        settings: buildSettings({
          flags: { output: options.output ?? "json" },
          env: {},
          file: {},
        }),
        flags: {
          api: "chat",
          message: ["hello"],
          stream: true,
        },
        client: {
          request: async () => chatStreamResponse(options.events),
        },
      }) as never,
    );
    return { stdout };
  } catch (error) {
    expect(error).toBeInstanceOf(BailianError);
    return { error: error as BailianError, stdout };
  }
}

describe("Chat Completions stream", () => {
  test("normal stop with finish_reason and [DONE] succeeds", async () => {
    const { error, stdout } = await runChatStream({
      events: [chunk({ content: "Hello " }), chunk({ content: "world" }, "stop"), "[DONE]"],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({
      content: "Hello world",
      finish_reason: "stop",
    });
  });

  test("finish_reason alone without [DONE] succeeds", async () => {
    const { error, stdout } = await runChatStream({
      events: [chunk({ content: "ok" }, "stop")],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({
      content: "ok",
      finish_reason: "stop",
    });
  });

  test("[DONE] alone succeeds with null finish_reason", async () => {
    const { error, stdout } = await runChatStream({
      events: [chunk({ content: "done-only" }), "[DONE]"],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({
      content: "done-only",
      finish_reason: null,
    });
  });

  test("empty completion with only [DONE] succeeds", async () => {
    const { error, stdout } = await runChatStream({
      events: ["[DONE]"],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({
      content: "",
      finish_reason: null,
    });
  });

  test("early EOF before completion throws GENERAL", async () => {
    const { error, stdout } = await runChatStream({
      events: [chunk({ content: "partial" })],
    });

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe(
      "Stream disconnected before completion: stream closed before [DONE] or finish_reason.",
    );
    expect(stdout).toBe("");
  });

  test("finish_reason length succeeds without error", async () => {
    const { error, stdout } = await runChatStream({
      events: [chunk({ content: "cut" }, "length"), "[DONE]"],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({
      content: "cut",
      finish_reason: "length",
    });
  });

  test("tool-only response returns structured tool_calls", async () => {
    const { error, stdout } = await runChatStream({
      events: [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"北京"}' },
            },
          ],
        }),
        chunk({}, "tool_calls"),
        "[DONE]",
      ],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual({
      content: "",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"北京"}' },
        },
      ],
      finish_reason: "tool_calls",
    });
  });

  test("multi-fragment tool arguments concatenate in order", async () => {
    const { error, stdout } = await runChatStream({
      events: [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"' },
            },
          ],
        }),
        chunk({
          tool_calls: [{ index: 0, function: { arguments: '北京"}' } }],
        }),
        chunk({}, "tool_calls"),
        "[DONE]",
      ],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout).tool_calls[0].function.arguments).toBe('{"city":"北京"}');
  });

  test("interleaved tool indexes sort ascending without mixing args", async () => {
    const { error, stdout } = await runChatStream({
      events: [
        chunk({
          tool_calls: [
            {
              index: 1,
              id: "call_b",
              type: "function",
              function: { name: "second", arguments: '{"b":' },
            },
          ],
        }),
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_a",
              type: "function",
              function: { name: "first", arguments: '{"a":1}' },
            },
          ],
        }),
        chunk({
          tool_calls: [{ index: 1, function: { arguments: "2}" } }],
        }),
        chunk({}, "tool_calls"),
        "[DONE]",
      ],
    });

    expect(error).toBeUndefined();
    expect(JSON.parse(stdout).tool_calls).toEqual([
      {
        id: "call_a",
        type: "function",
        function: { name: "first", arguments: '{"a":1}' },
      },
      {
        id: "call_b",
        type: "function",
        function: { name: "second", arguments: '{"b":2}' },
      },
    ]);
  });

  test("conflicting ids on the same index throw a protocol error", async () => {
    const { error } = await runChatStream({
      events: [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: "{" },
            },
          ],
        }),
        chunk({
          tool_calls: [{ index: 0, id: "call_2", function: { arguments: "}" } }],
        }),
      ],
    });

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("Tool call index returned conflicting ids.");
  });

  test("duplicate ids across indexes throw a protocol error", async () => {
    const { error } = await runChatStream({
      events: [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_same",
              type: "function",
              function: { name: "first", arguments: "{}" },
            },
            {
              index: 1,
              id: "call_same",
              type: "function",
              function: { name: "second", arguments: "{}" },
            },
          ],
        }),
        chunk({}, "tool_calls"),
        "[DONE]",
      ],
    });

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("Duplicate tool call id across indexes.");
  });

  test("finish rejects tool calls missing id or name", async () => {
    const { error } = await runChatStream({
      events: [
        chunk({
          tool_calls: [{ index: 0, function: { arguments: '{"city":"北京"}' } }],
        }),
        chunk({}, "tool_calls"),
        "[DONE]",
      ],
    });

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("Tool call is missing a required id or function name.");
  });

  test("tool delta missing index throws a protocol error", async () => {
    const { error } = await runChatStream({
      events: [
        chunk({
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: "{}" },
            },
          ],
        }),
      ],
    });

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("Tool call delta is missing a valid index.");
  });

  test("service error event preserves the original message", async () => {
    const { error } = await runChatStream({
      events: [
        `event: error\ndata: ${JSON.stringify({ message: "provider quota exceeded", code: "quota" })}`,
      ],
    });

    expect(error?.exitCode).toBe(ExitCode.GENERAL);
    expect(error?.message).toBe("provider quota exceeded");
  });

  test("text mode streams content once without reprinting the final result", async () => {
    const { error, stdout } = await runChatStream({
      output: "text",
      events: [chunk({ content: "Hello " }), chunk({ content: "world" }, "stop"), "[DONE]"],
    });

    expect(error).toBeUndefined();
    // Reporter still ends the empty text result with a trailing newline.
    expect(stdout).toBe("Hello world\n");
  });

  test("text mode tool-only response does not render tool_calls", async () => {
    const { error, stdout } = await runChatStream({
      output: "text",
      events: [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"北京"}' },
            },
          ],
        }),
        chunk({}, "tool_calls"),
        "[DONE]",
      ],
    });

    expect(error).toBeUndefined();
    // Empty text result still emits the reporter's trailing newline only.
    expect(stdout).toBe("\n");
  });
});
