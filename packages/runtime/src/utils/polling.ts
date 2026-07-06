import { BailianError, ExitCode, type Client, type Settings } from "bailian-cli-core";
import { createSpinner } from "../output/progress.ts";

export interface PollOptions {
  /** Absolute task URL (Client passes absolute URLs through as-is). */
  url: string;
  intervalSec: number;
  timeoutSec: number;
  isComplete: (data: unknown) => boolean;
  isFailed: (data: unknown) => boolean;
  getStatus?: (data: unknown) => string;
  getErrorMessage?: (data: unknown) => string | undefined;
}

export async function poll<T>(client: Client, settings: Settings, opts: PollOptions): Promise<T> {
  const deadline = Date.now() + opts.timeoutSec * 1000;
  const spinner = createSpinner("Polling...");

  if (!settings.quiet) spinner.start();

  try {
    while (Date.now() < deadline) {
      const data = await client.requestJson<T>({ path: opts.url });

      if (opts.getStatus && !settings.quiet) {
        spinner.update(`Status: ${opts.getStatus(data)}`);
      }

      if (opts.isComplete(data)) {
        spinner.stop("Done.");
        return data;
      }

      if (opts.isFailed(data)) {
        spinner.stop("Failed.");
        if (settings.verbose) {
          process.stderr.write(`[verbose] Task response: ${JSON.stringify(data, null, 2)}\n`);
        }
        const errMsg = opts.getErrorMessage?.(data);
        throw new BailianError(
          errMsg ? `Task failed: ${errMsg}` : "Task failed.",
          ExitCode.GENERAL,
          errMsg ? undefined : "Use --verbose to see full API response details.",
        );
      }

      await new Promise((r) => setTimeout(r, opts.intervalSec * 1000));
    }
  } finally {
    spinner.stop();
  }

  throw new BailianError(
    "Polling timed out.",
    ExitCode.TIMEOUT,
    "Try increasing --timeout or check task status manually.",
  );
}
