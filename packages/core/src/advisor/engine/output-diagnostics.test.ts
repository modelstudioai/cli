import { afterEach, expect, test, vi } from "vite-plus/test";
import { recommend } from "./pipeline.ts";
import { LLMError } from "./llm/errors.ts";
afterEach(() => vi.restoreAllMocks());
test("pure advisor pipeline is silent without diagnostic callbacks", async () => {
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  await expect(
    recommend("fixture", {
      catalog: async () => [],
      llm: {
        chat: vi.fn(),
        chatJson: async () => {
          throw new LLMError("network", "fixture failure");
        },
        chatWithTools: vi.fn(),
      },
    }),
  ).rejects.toMatchObject({ message: "fixture failure" });
  expect(stderr).not.toHaveBeenCalled();
});
test("advisor pipeline reports failure trace through optional callback", async () => {
  const onTrace = vi.fn();
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  await expect(
    recommend("fixture", {
      catalog: async () => [],
      llm: {
        chat: vi.fn(),
        chatJson: async () => {
          throw new LLMError("network", "fixture failure");
        },
        chatWithTools: vi.fn(),
      },
      onTrace,
    } as never),
  ).rejects.toMatchObject({ message: "fixture failure" });
  expect(onTrace).toHaveBeenCalledOnce();
  expect(onTrace.mock.calls[0][0]).toMatchObject({
    failure: { kind: "network", message: "fixture failure" },
  });
  expect(stderr).not.toHaveBeenCalled();
});
