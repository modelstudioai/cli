/** resolve / adjust / retry helpers for chat `enable_thinking`. */

/** Resolve the initial `enable_thinking` value (`undefined` omits the field). */
export function resolveChatEnableThinking(options: {
  enableThinking?: boolean;
  /** Whether the request is streaming. */
  stream?: boolean;
}): boolean | undefined {
  if (options.enableThinking) return true;
  if (options.stream === false) return false;
  return undefined;
}

export type EnableThinkingAdjustResult =
  | { kind: "retry"; value: boolean | undefined }
  | { kind: "none" };

/** Map clear `enable_thinking` constraint errors to a one-shot retry adjustment. */
export function adjustEnableThinkingAfterError(
  current: boolean | undefined,
  errorMessage: string,
): EnableThinkingAdjustResult {
  if (current !== true && /enable_thinking parameter is restricted to\s*true/i.test(errorMessage)) {
    return { kind: "retry", value: true };
  }

  if (current === undefined && /enable_thinking must be set to false/i.test(errorMessage)) {
    return { kind: "retry", value: false };
  }

  if (current !== undefined && /does not support enable_thinking/i.test(errorMessage)) {
    return { kind: "retry", value: undefined };
  }

  return { kind: "none" };
}

/** Set or remove `enable_thinking`; clear `thinking_budget` when disabled or omitted. */
export function applyChatEnableThinking(
  body: { enable_thinking?: boolean; thinking_budget?: number },
  value: boolean | undefined,
): void {
  if (value === undefined) {
    delete body.enable_thinking;
    delete body.thinking_budget;
    return;
  }
  if (value === false) {
    body.enable_thinking = false;
    delete body.thinking_budget;
    return;
  }
  body.enable_thinking = true;
}

/** Set `enable_thinking` and optionally write `thinking_budget` when enabled. */
export function applyChatEnableThinkingWithBudget(
  body: { enable_thinking?: boolean; thinking_budget?: number },
  value: boolean | undefined,
  thinkingBudget?: number,
): void {
  applyChatEnableThinking(body, value);
  if (value === true && thinkingBudget !== undefined) {
    body.thinking_budget = thinkingBudget;
  }
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Run once, then retry once if the error indicates an `enable_thinking` constraint. */
export async function withEnableThinkingRetry<T>(options: {
  initial: boolean | undefined;
  apply: (value: boolean | undefined) => void;
  run: () => Promise<T>;
}): Promise<T> {
  options.apply(options.initial);
  try {
    return await options.run();
  } catch (error) {
    const adjusted = adjustEnableThinkingAfterError(options.initial, errorMessageOf(error));
    if (adjusted.kind === "none") throw error;
    options.apply(adjusted.value);
    return await options.run();
  }
}
