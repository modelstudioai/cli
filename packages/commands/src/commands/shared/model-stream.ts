import { BailianError, ExitCode } from "bailian-cli-core";

/** Parse model SSE data while preserving service failures for the runtime error renderer. */
export function parseModelStreamEvent(event: {
  event?: string;
  data: string;
}): Record<string, unknown> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(event.data);
  } catch {
    if (event.event === "error") throw new BailianError(event.data, ExitCode.GENERAL);
    return undefined;
  }
  const payload =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  if (!payload) return undefined;
  const nested =
    payload.error !== null && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : undefined;
  const code = nested?.code ?? payload.code;
  if (
    event.event === "error" ||
    nested ||
    ((typeof code === "string" || typeof code === "number") &&
      !["200", "0", "Success", "SUCCESS"].includes(String(code)))
  ) {
    const message = nested?.message ?? payload.message;
    throw new BailianError(
      typeof message === "string" ? message : event.data,
      ExitCode.GENERAL,
      undefined,
      {
        api: {
          apiCode: typeof code === "string" ? code : undefined,
          requestId: typeof payload.request_id === "string" ? payload.request_id : undefined,
        },
        rawResponse: event.data,
      },
    );
  }
  return payload;
}
