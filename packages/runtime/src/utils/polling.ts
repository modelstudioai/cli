import { BailianError, ExitCode, type Client, type CommandOutput } from "bailian-cli-core";

export interface PollOptions {
  output: Pick<CommandOutput, "progress" | "debug">;
  /** Absolute task URL (Client passes absolute URLs through as-is). */
  url: string;
  /** Optional complete snapshot loader (for paginated task APIs). */
  load?: () => Promise<unknown>;
  intervalSec: number;
  timeoutSec: number;
  isComplete: (data: unknown) => boolean;
  isFailed: (data: unknown) => boolean;
  getStatus?: (data: unknown) => string;
  getErrorMessage?: (data: unknown) => string | undefined;
}

export async function poll<T>(client: Client, opts: PollOptions): Promise<T> {
  const deadline = Date.now() + opts.timeoutSec * 1000;
  const { output } = opts;
  output.progress({ "en-US": "Polling...", "zh-CN": "正在查询任务状态……" });

  while (Date.now() < deadline) {
    const data = opts.load
      ? ((await opts.load()) as T)
      : await client.requestJson<T>({ path: opts.url });

    if (opts.getStatus) {
      const status = opts.getStatus(data);
      output.progress({ "en-US": `Status: ${status}`, "zh-CN": `状态：${status}` });
    }

    if (opts.isComplete(data)) {
      output.progress({ "en-US": "Done.", "zh-CN": "已完成。" });
      return data;
    }

    if (opts.isFailed(data)) {
      output.progress({ "en-US": "Failed.", "zh-CN": "任务失败。" });
      output.debug({ message: { "en-US": "Task response", "zh-CN": "任务响应" }, details: data });
      const errMsg = opts.getErrorMessage?.(data);
      throw new BailianError(
        errMsg ? `Task failed: ${errMsg}` : "Task failed.",
        ExitCode.GENERAL,
        errMsg ? undefined : "Use --verbose to see full API response details.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, opts.intervalSec * 1000));
  }

  throw new BailianError(
    "Polling timed out.",
    ExitCode.TIMEOUT,
    "Try increasing --timeout or check task status manually.",
  );
}
