import {
  BailianError,
  ExitCode,
  BATCH_TERMINAL,
  getBatch,
  batchUsage,
  type BatchJob,
  type Client,
  type FlagsDef,
} from "bailian-cli-core";
import { setTimeout as delay } from "node:timers/promises";

export const BATCH_ID_FLAGS = {
  batchId: {
    type: "string",
    required: true,
    valueHint: "<id>",
    description: { "en-US": "Batch task ID", "zh-CN": "Batch 任务 ID" },
  },
} satisfies FlagsDef;
export const FORCE_FLAGS = {
  force: {
    type: "switch",
    description: {
      "en-US": "Replace existing output files (atomic per file)",
      "zh-CN": "覆盖已有输出文件（逐文件原子替换）",
    },
  },
} satisfies FlagsDef;
export const ENDPOINT_FLAGS = {
  endpoint: {
    type: "string",
    valueHint: "<path>",
    choices: ["/v1/chat/completions", "/v1/embeddings", "/v1/chat/ds-test"] as const,
    description: {
      "en-US": "Batch endpoint (inferred from local JSONL)",
      "zh-CN": "Batch endpoint（本地 JSONL 可自动推导）",
    },
  },
} satisfies FlagsDef;
export const DRY_RUN_NOTE = {
  "en-US":
    "Dry-run does not call business APIs or write business files. Update checks and telemetry follow framework settings.",
  "zh-CN": "dry-run 不调用业务 API、不写业务文件；更新检查与遥测仍遵循框架配置。",
};
export function batchInteger(
  value: number | undefined,
  name: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): void {
  if (value !== undefined && (!Number.isInteger(value) || value < min || value > max))
    batchUsage(
      `${name} must be an integer between ${min} and ${max}.`,
      `${name} 必须是 ${min}–${max} 的整数。`,
    );
}
export function completionWindow(value = "24h"): string {
  const match = /^(\d+)([hd])$/.exec(value);
  const hours = match ? Number(match[1]) * (match[2] === "d" ? 24 : 1) : NaN;
  if (!Number.isSafeInteger(hours) || hours < 24 || hours > 336)
    batchUsage(
      "--completion-window must be 24–336 hours (integer h/d).",
      "--completion-window 必须为 24–336 小时（整数 h/d）。",
    );
  return value;
}
export function batchDate(value: string | undefined): void {
  if (value === undefined) return;
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  const date = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`)
    : new Date(NaN);
  if (
    !match ||
    !Number.isFinite(date.getTime()) ||
    date
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14) !== value
  )
    batchUsage(
      "Time must be a real date in yyyyMMddHHmmss (API timezone; no conversion).",
      "时间必须为真实的 yyyyMMddHHmmss 日期（API 时区，不自动转换）。",
    );
}
export function validateBatchSource(source: string): void {
  if (/^file-[A-Za-z0-9_-]+$/.test(source) || /^oss:[a-z0-9-]+:[^/\s]+\/\S+$/.test(source)) return;
  try {
    const url = new URL(source);
    if (url.protocol === "https:") return;
  } catch {
    /* 由统一使用错误给出提示。 */
  }
  batchUsage(
    "--input-file-id expects a file ID, OSS HTTPS URL, or oss:region:bucket/path.",
    "--input-file-id 需要文件 ID、OSS HTTPS URL 或 oss:region:bucket/path。",
  );
}
export function batchMetadata(flags: {
  name?: string;
  description?: string;
  callbackUrl?: string;
  metadata?: string[];
}): Record<string, string> | undefined {
  if (flags.name && Array.from(flags.name).length > 100)
    batchUsage("--name exceeds 100 characters.", "--name 超过 100 字符。");
  if (flags.description && Array.from(flags.description).length > 200)
    batchUsage("--description exceeds 200 characters.", "--description 超过 200 字符。");
  if (flags.callbackUrl) {
    try {
      if (!["http:", "https:"].includes(new URL(flags.callbackUrl).protocol)) throw new Error();
    } catch {
      batchUsage("--callback-url must be HTTP(S).", "--callback-url 必须为 HTTP(S) 地址。");
    }
  }
  const result: Record<string, string> = Object.create(null);
  const reserved = new Set(["ds_name", "ds_description", "ds_batch_finish_callback"]);
  for (const entry of flags.metadata ?? []) {
    const equal = entry.indexOf("=");
    const key = entry.slice(0, equal);
    if (equal <= 0 || reserved.has(key) || Object.hasOwn(result, key))
      batchUsage(
        "--metadata requires unique KEY=VALUE; use dedicated flags for reserved fields.",
        "--metadata 需要不重复的 KEY=VALUE，保留字段使用专属参数。",
      );
    result[key] = entry.slice(equal + 1);
  }
  if (flags.name !== undefined) result.ds_name = flags.name;
  if (flags.description !== undefined) result.ds_description = flags.description;
  if (flags.callbackUrl !== undefined) result.ds_batch_finish_callback = flags.callbackUrl;
  return Object.keys(result).length ? result : undefined;
}

function retryable(error: unknown): boolean {
  if (error instanceof BailianError)
    return (
      error.exitCode === ExitCode.NETWORK ||
      error.exitCode === ExitCode.TIMEOUT ||
      error.api?.httpStatus === 429 ||
      (error.api?.httpStatus !== undefined && error.api.httpStatus >= 500)
    );
  return (
    error instanceof Error &&
    ((error instanceof TypeError && error.message === "fetch failed") ||
      error.name === "AbortError" ||
      error.name === "TimeoutError")
  );
}
// Batch 私有轮询：统一预算覆盖在途请求、退避及查询最小间隔。
export async function followBatch(
  client: Client,
  batchId: string,
  options: {
    interval: number;
    pollTimeout?: number;
    signal?: AbortSignal;
    progress?: (job: BatchJob) => void;
  },
): Promise<BatchJob> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const deadline =
    options.pollTimeout === undefined ? Infinity : Date.now() + options.pollTimeout * 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armDeadline = () => {
    if (deadline === Infinity || controller.signal.aborted) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      controller.abort(
        new BailianError(
          "Batch polling budget exhausted. / Batch 轮询总时限已到。",
          ExitCode.TIMEOUT,
          "The remote task was not cancelled. / 未取消远端任务。",
        ),
      );
    else timer = setTimeout(armDeadline, Math.min(remaining, 2_147_483_647));
  };
  armDeadline();
  let lastStart = -Infinity;
  let failures = 0;
  try {
    while (true) {
      const wait = Math.max(
        0,
        lastStart + options.interval * 1000 - Date.now(),
        failures ? Math.min(60_000, 1000 * 2 ** (failures - 1)) : 0,
      );
      const resumeAt = Date.now() + wait;
      let remaining = wait;
      while (remaining > 0) {
        await delay(Math.min(remaining, 2_147_483_647), undefined, { signal: controller.signal });
        remaining = resumeAt - Date.now();
      }
      controller.signal.throwIfAborted();
      lastStart = Date.now();
      let job: BatchJob;
      try {
        job = await getBatch(client, batchId, controller.signal);
        failures = 0;
      } catch (error) {
        if (controller.signal.aborted || !retryable(error) || failures >= 3) throw error;
        failures++;
        continue;
      } finally {
        // 从请求结束起留足间隔，保证传输初始化耗时不会缩短实际请求开始间距。
        lastStart = Date.now();
      }
      controller.signal.throwIfAborted();
      options.progress?.(job);
      if (BATCH_TERMINAL.has(job.status)) return job;
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
