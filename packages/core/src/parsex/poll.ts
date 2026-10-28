import { setTimeout as delay } from "node:timers/promises";
import type { Client } from "../client/client.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import { getParsexResult } from "./request.ts";
import type { ParsexOperation, ParsexResultRequest, ParsexResultResponse } from "./types.ts";

/** The deadline covers both in-flight requests and the interval between requests. */
export async function followParsexResult(
  client: Client,
  baseUrl: string,
  operation: ParsexOperation,
  body: ParsexResultRequest,
  options: {
    interval: number;
    pollTimeout: number;
    signal?: AbortSignal;
    progress?: (response: ParsexResultResponse) => void;
  },
): Promise<ParsexResultResponse> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new BailianError(
          "ParseX polling timed out. / ParseX 轮询超时。",
          ExitCode.TIMEOUT,
          `The remote task was not cancelled; query the same biz_id: ${body.biz_id}. / 未取消远端任务，请使用同一 biz_id 继续查询。`,
        ),
      ),
    options.pollTimeout * 1000,
  );
  try {
    while (true) {
      controller.signal.throwIfAborted();
      try {
        const response = await getParsexResult(client, baseUrl, operation, body, controller.signal);
        controller.signal.throwIfAborted();
        options.progress?.(response);
        if (response.data.status === "success" || response.data.status === "failed")
          return response;
      } catch (error) {
        // Documented pending response, not a failed job. All other service errors pass through.
        if (
          controller.signal.aborted ||
          !(error instanceof BailianError) ||
          error.api?.apiCode !== "ResultNotReady"
        )
          throw error;
      }
      await delay(options.interval * 1000, undefined, { signal: controller.signal });
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
