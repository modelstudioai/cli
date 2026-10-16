import type { LocalizedText } from "../types/command.ts";

const TIMEOUT_ERROR_MESSAGE = {
  "en-US": "Timeout must be a positive finite number.",
  "zh-CN": "请求超时必须是一个有限的正数。",
} as const satisfies LocalizedText;

/** Shared timeout constraint for effective settings and CLI flag validation. */
export function validateTimeout(timeout: unknown): typeof TIMEOUT_ERROR_MESSAGE | undefined {
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
    return TIMEOUT_ERROR_MESSAGE;
  }
  return undefined;
}
