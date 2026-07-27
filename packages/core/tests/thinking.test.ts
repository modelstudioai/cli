import { expect, test } from "vite-plus/test";
import {
  adjustEnableThinkingAfterError,
  applyChatEnableThinking,
  resolveChatEnableThinking,
  withEnableThinkingRetry,
} from "../src/models/thinking.ts";

test("resolveChatEnableThinking：显式开启为 true，非流式默认 false，流式默认 omit", () => {
  expect(resolveChatEnableThinking({ enableThinking: true })).toBe(true);
  expect(resolveChatEnableThinking({ enableThinking: true, stream: false })).toBe(true);
  expect(resolveChatEnableThinking({ stream: false })).toBe(false);
  expect(resolveChatEnableThinking({ enableThinking: false, stream: false })).toBe(false);
  expect(resolveChatEnableThinking({ stream: true })).toBeUndefined();
  expect(resolveChatEnableThinking({})).toBeUndefined();
});

test("adjustEnableThinkingAfterError：false/omit 被要求 true 时重试为 true", () => {
  expect(
    adjustEnableThinkingAfterError(
      false,
      "The value of the enable_thinking parameter is restricted to True.",
    ),
  ).toEqual({ kind: "retry", value: true });
  expect(
    adjustEnableThinkingAfterError(
      undefined,
      "The value of the enable_thinking parameter is restricted to True.",
    ),
  ).toEqual({ kind: "retry", value: true });
});

test("adjustEnableThinkingAfterError：omit 被要求 false 时重试为 false", () => {
  expect(
    adjustEnableThinkingAfterError(
      undefined,
      "parameter.enable_thinking must be set to false for non-streaming calls",
    ),
  ).toEqual({ kind: "retry", value: false });
});

test("adjustEnableThinkingAfterError：不支持时去掉字段", () => {
  expect(
    adjustEnableThinkingAfterError(false, "The model qwen-turbo does not support enable_thinking."),
  ).toEqual({ kind: "retry", value: undefined });
  expect(
    adjustEnableThinkingAfterError(true, "The model qwen-turbo does not support enable_thinking."),
  ).toEqual({ kind: "retry", value: undefined });
});

test("adjustEnableThinkingAfterError：无关错误不调整", () => {
  expect(adjustEnableThinkingAfterError(undefined, "Access denied")).toEqual({ kind: "none" });
  expect(adjustEnableThinkingAfterError(false, "Model not exist")).toEqual({ kind: "none" });
  expect(
    adjustEnableThinkingAfterError(
      true,
      "The value of the enable_thinking parameter is restricted to True.",
    ),
  ).toEqual({ kind: "none" });
});

test("applyChatEnableThinking：设置 / 删除字段，并在关闭时清 thinking_budget", () => {
  const body: { enable_thinking?: boolean; thinking_budget?: number } = {
    thinking_budget: 1024,
  };
  applyChatEnableThinking(body, true);
  expect(body.enable_thinking).toBe(true);
  expect(body.thinking_budget).toBe(1024);

  applyChatEnableThinking(body, false);
  expect(body.enable_thinking).toBe(false);
  expect(body).not.toHaveProperty("thinking_budget");

  body.thinking_budget = 2048;
  applyChatEnableThinking(body, undefined);
  expect(body).not.toHaveProperty("enable_thinking");
  expect(body).not.toHaveProperty("thinking_budget");
});

test("withEnableThinkingRetry：restricted-to-true 时从 false 重试为 true", async () => {
  const values: Array<boolean | undefined> = [];
  let calls = 0;

  const result = await withEnableThinkingRetry({
    initial: false,
    apply: (value) => {
      values.push(value);
    },
    run: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("The value of the enable_thinking parameter is restricted to True.");
      }
      return "ok";
    },
  });

  expect(result).toBe("ok");
  expect(calls).toBe(2);
  expect(values).toEqual([false, true]);
});

test("withEnableThinkingRetry：must-be-false 时从 omit 重试为 false", async () => {
  const values: Array<boolean | undefined> = [];
  let calls = 0;

  const result = await withEnableThinkingRetry({
    initial: undefined,
    apply: (value) => {
      values.push(value);
    },
    run: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("parameter.enable_thinking must be set to false for non-streaming calls");
      }
      return "ok";
    },
  });

  expect(result).toBe("ok");
  expect(calls).toBe(2);
  expect(values).toEqual([undefined, false]);
});

test("withEnableThinkingRetry：无关错误原样抛出", async () => {
  await expect(
    withEnableThinkingRetry({
      initial: false,
      apply: () => {},
      run: async () => {
        throw new Error("Access denied");
      },
    }),
  ).rejects.toThrow(/Access denied/);
});
