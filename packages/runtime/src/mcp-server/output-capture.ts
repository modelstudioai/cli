import { AsyncLocalStorage } from "node:async_hooks";

interface CaptureState {
  chunks: string[];
}

const captureStore = new AsyncLocalStorage<CaptureState>();

/** True when {@link emitResult} / {@link emitBare} should buffer instead of writing stdout. */
export function isCapturingOutput(): boolean {
  return captureStore.getStore() !== undefined;
}

/** Append a line to the active capture buffer. No-op outside {@link withCapturedOutput}. */
export function appendCapturedOutput(chunk: string): void {
  const state = captureStore.getStore();
  if (state) state.chunks.push(chunk);
}

/**
 * Run `fn` while diverting {@link emitResult} / {@link emitBare} into a buffer
 * so MCP STDIO can keep exclusive ownership of process.stdout.
 */
export async function withCapturedOutput<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; stdout: string }> {
  const state: CaptureState = { chunks: [] };
  const value = await captureStore.run(state, fn);
  return { value, stdout: state.chunks.join("") };
}
