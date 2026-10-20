import { BailianError, ExitCode, type FlagsDef } from "bailian-cli-core";

export const COMPRESS_JOB_ID_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Compression job ID (required)",
      "zh-CN": "压缩任务 ID（必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

export const COMPRESS_TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

/** Parse repeatable KEY=VALUE entries without coercing values. */
export function parseCompressHyperParameters(
  entries: string[] | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries ?? []) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new BailianError(
        "--hparam values must use KEY=VALUE format. / --hparam 必须使用 KEY=VALUE 格式。",
        ExitCode.USAGE,
      );
    }
    const key = entry.slice(0, separator).trim();
    if (!key) {
      throw new BailianError(
        "--hparam requires a non-empty key. / --hparam 的键不能为空。",
        ExitCode.USAGE,
      );
    }
    result[key] = entry.slice(separator + 1);
  }
  return result;
}

export function parseCommaSeparated(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  return items.length ? items : undefined;
}

export function formatCompressFailure(
  jobId: string,
  status: string,
  message?: string,
): BailianError {
  return new BailianError(
    message ||
      `Compression job ${jobId} ended in status ${status}. / 压缩任务 ${jobId} 已以 ${status} 状态结束。`,
    ExitCode.GENERAL,
  );
}

export function sleepWithSignal(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
