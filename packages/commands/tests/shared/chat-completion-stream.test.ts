import { describe, expect, test } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import { createChatCompletionStreamAccumulator } from "../../src/commands/shared/chat-completion-stream.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);

function contentEvent(content: string, finishReason?: string) {
  return {
    data: JSON.stringify({
      choices: [
        {
          delta: { content },
          ...(finishReason ? { finish_reason: finishReason } : {}),
        },
      ],
    }),
  };
}

describe("chat-completion-stream contentMode", () => {
  test("delta mode appends fragments", () => {
    const accumulator = createChatCompletionStreamAccumulator(localize, { contentMode: "delta" });
    expect(accumulator.accept(contentEvent("H")).content).toBe("H");
    expect(accumulator.accept(contentEvent("ello")).content).toBe("ello");
    expect(accumulator.accept(contentEvent(" world", "stop")).content).toBe(" world");
    expect(accumulator.finish().content).toBe("Hello world");
  });

  test("snapshot mode emits only new suffixes", () => {
    const accumulator = createChatCompletionStreamAccumulator(localize, {
      contentMode: "snapshot",
    });
    expect(accumulator.accept(contentEvent("H")).content).toBe("H");
    expect(accumulator.accept(contentEvent("Hello")).content).toBe("ello");
    expect(accumulator.accept(contentEvent("Hello world")).content).toBe(" world");
    expect(accumulator.accept(contentEvent("Hello world")).content).toBe("");
    accumulator.accept({ data: "[DONE]" });
    expect(accumulator.finish().content).toBe("Hello world");
  });

  test("snapshot mode rejects non-prefix snapshots", () => {
    const accumulator = createChatCompletionStreamAccumulator(localize, {
      contentMode: "snapshot",
    });
    accumulator.accept(contentEvent("Hello"));
    expect(() => accumulator.accept(contentEvent("Hi"))).toThrow(/protocol|snapshot/i);
  });
});
