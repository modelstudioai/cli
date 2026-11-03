import { BailianError, ExitCode, type CustomModelImportJob, type FlagsDef } from "bailian-cli-core";

export const IMPORT_JOB_ID_FLAGS = {
  jobId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Import job ID returned by `cmodel import` (required)",
      "zh-CN": "由 `cmodel import` 返回的导入任务 ID（必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

/** Server-documented terminal statuses (including the `SUCCESSED` spelling). */
export const IMPORT_TERMINAL_STATUSES = new Set(["SUCCESSED", "FAILED"]);

/** cmodel APIs live on the public DashScope host, not workspace hosts. */
export const PUBLIC_DASHSCOPE_NOTE = {
  "en-US":
    "This command always calls the public DashScope endpoint (https://dashscope.aliyuncs.com) in the Beijing region. The API is not deployed on workspace-specific base URLs (https://<workspace>.cn-beijing.maas.aliyuncs.com, HTTP 404), so the Profile base URL is not used for this request; workspace API keys are accepted.",
  "zh-CN":
    "该命令固定调用公共 DashScope 站点（https://dashscope.aliyuncs.com，北京地域）。此 API 未部署在 Workspace 专属 base URL（https://<workspace>.cn-beijing.maas.aliyuncs.com，返回 HTTP 404）上，因此本次请求不使用 Profile 的 base URL；Workspace API Key 可正常调用。",
};

export function buildImportJobOutput(
  job: CustomModelImportJob,
  fallbackJobId: string,
): Record<string, unknown> {
  return {
    job_id: job.job_id ?? fallbackJobId,
    model_name: job.model_name ?? "",
    display_name: job.display_name ?? "",
    source: job.source ?? "",
    storage_info: job.storage_info ?? null,
    status: job.status ?? "",
    gmt_create: job.gmt_create ?? "",
    ...(job.error_code !== undefined ? { error_code: job.error_code } : {}),
  };
}

export function formatImportFailure(
  jobId: string,
  status: string,
  errorCode?: string,
): BailianError {
  const detail = errorCode ? ` Server error_code: ${errorCode}` : "";
  return new BailianError(
    `Import job ${jobId} ended in status ${status}.${detail} / 导入任务 ${jobId} 已以 ${status} 状态结束。${
      errorCode ? ` 服务端错误：${errorCode}` : ""
    }`,
    ExitCode.GENERAL,
  );
}

/**
 * Resolve after `milliseconds`, rejecting early if `signal` aborts (Ctrl-C).
 */
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
