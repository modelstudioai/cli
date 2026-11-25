import {
  BailianError,
  ExitCode,
  REGIONS,
  resolveOutputDir,
  ASYNC_FLAG,
  type Client,
  type CommandContext,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import { dirname, join } from "path";
import { accessSync, constants, existsSync, lstatSync, statSync } from "fs";
import { downloadDashScopeTaskResult, pollDashScopeTask } from "../shared/dashscope-task.ts";
import { isHttpUrl } from "../shared/translation.ts";

/** Floor aligned with video edit/ref long-running tasks. */
export const SPECIALIZED_VIDEO_TIMEOUT_FLOOR_SEC = 600;

const BEIJING_ONLY_MESSAGE: LocalizedText = {
  "en-US":
    "This model is available only in China (Beijing). Use the Beijing base URL (https://dashscope.aliyuncs.com) and a Beijing-region API Key.",
  "zh-CN":
    "该模型仅支持华北 2（北京）地域。请使用北京地域 base URL（https://dashscope.aliyuncs.com）和北京地域 API Key。",
};

export const SPECIALIZED_VIDEO_SHARED_FLAGS = {
  download: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Save video to this file on completion (default: <output-dir>/videos/<task_id>.mp4)",
      "zh-CN": "完成后将视频保存到此文件（默认：<output-dir>/videos/<task_id>.mp4）",
    },
  },
  ...ASYNC_FLAG,
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval when waiting (default: 15)",
      "zh-CN": "等待任务时的轮询间隔（默认：15 秒）",
    },
  },
} satisfies FlagsDef;

export function pendingUploadMarker(localPath: string): string {
  return `<local-file:${localPath};pending-upload>`;
}

export function previewMediaUrl(value: string): string {
  if (isHttpUrl(value) || value.startsWith("oss://")) return value;
  return pendingUploadMarker(value);
}

function isOssUrl(value: string): boolean {
  return value.startsWith("oss://");
}

/** Usage error for media flags; safe for command.validate (auth-independent). */
export function mediaInputError(
  value: string | undefined,
  flagName: string,
  options?: { allowLocal?: boolean },
): LocalizedText | undefined {
  if (value === undefined || value === "") {
    return {
      "en-US": `${flagName} must not be empty.`,
      "zh-CN": `${flagName} 不能为空。`,
    };
  }
  // Pass http(s) through as-is (including non-ASCII); no encodeURI.
  if (isHttpUrl(value)) return undefined;
  if (isOssUrl(value)) {
    if (options?.allowLocal === false) {
      return {
        "en-US": `${flagName} must be a public http(s) URL (oss:// and local paths are not supported in v1).`,
        "zh-CN": `${flagName} 必须是公网 http(s) URL（v1 不支持 oss:// 与本地路径）。`,
      };
    }
    return undefined;
  }
  if (options?.allowLocal === false) {
    return {
      "en-US": `${flagName} must be a public http(s) URL (local paths are not supported in v1).`,
      "zh-CN": `${flagName} 必须是公网 http(s) URL（v1 不支持本地路径）。`,
    };
  }
  if (!existsSync(value)) {
    return {
      "en-US": `File not found: ${value}`,
      "zh-CN": `文件不存在：${value}`,
    };
  }
  if (!statSync(value).isFile()) {
    return {
      "en-US": `Not a file: ${value}`,
      "zh-CN": `不是文件：${value}`,
    };
  }
  return undefined;
}

/** Validate --download before submitting a billable task. */
export function downloadPathError(downloadPath: string | undefined): LocalizedText | undefined {
  if (downloadPath === undefined || downloadPath === "") return undefined;
  try {
    const entry = lstatSync(downloadPath);
    const targetStats = entry.isSymbolicLink() ? statSync(downloadPath) : entry;
    if (!targetStats.isFile()) {
      return {
        "en-US": `--download must be a regular file path (not a directory): ${downloadPath}`,
        "zh-CN": `--download 必须是普通文件路径（不能是目录）：${downloadPath}`,
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        "en-US": `Cannot access --download path: ${downloadPath}`,
        "zh-CN": `无法访问 --download 路径：${downloadPath}`,
      };
    }
  }

  const parentDir = dirname(downloadPath);
  if (!existsSync(parentDir)) return undefined;
  try {
    accessSync(parentDir, constants.W_OK);
  } catch {
    return {
      "en-US": `--download parent directory is not writable: ${parentDir}`,
      "zh-CN": `--download 父目录不可写：${parentDir}`,
    };
  }
  return undefined;
}

/** Shared validate for --async / --download / --poll-interval. */
export function specializedLifecycleFlagError(flags: {
  async?: boolean;
  download?: string;
  pollInterval?: number;
}): LocalizedText | undefined {
  if (
    flags.pollInterval !== undefined &&
    (!(flags.pollInterval > 0) || !Number.isFinite(flags.pollInterval))
  ) {
    return {
      "en-US": "--poll-interval must be a positive number.",
      "zh-CN": "--poll-interval 必须为正数。",
    };
  }
  if (flags.async) {
    if (flags.download !== undefined) {
      return {
        "en-US": "--async cannot be combined with --download.",
        "zh-CN": "--async 不能与 --download 同时使用。",
      };
    }
    if (flags.pollInterval !== undefined) {
      return {
        "en-US": "--async cannot be combined with --poll-interval.",
        "zh-CN": "--async 不能与 --poll-interval 同时使用。",
      };
    }
  }
  return downloadPathError(flags.download);
}

export async function resolveMediaUrl(
  client: Client,
  value: string,
  model: string,
): Promise<string> {
  if (isHttpUrl(value) || isOssUrl(value)) return value;
  return client.uploadFile(value, model);
}

/** Reject known non-Beijing official DashScope hosts before submitting. */
export function assertBeijingDashScopeEndpoint(
  endpointUrl: string,
  localize: (text: LocalizedText) => string,
): void {
  let hostname: string;
  try {
    hostname = new URL(endpointUrl).hostname;
  } catch {
    return;
  }
  const beijingHost = new URL(REGIONS.cn).hostname;
  if (hostname === beijingHost) return;
  if (hostname.endsWith(".cn-beijing.maas.aliyuncs.com")) return;

  const intlHost = new URL(REGIONS.intl).hostname;
  const usHost = new URL(REGIONS.us).hostname;
  const isKnownNonBeijing =
    hostname === intlHost ||
    hostname === usHost ||
    hostname.includes("dashscope-intl") ||
    hostname.includes("dashscope-us") ||
    hostname.includes("ap-southeast-1") ||
    hostname.includes("us-east-1");
  if (!isKnownNonBeijing) return;

  throw new BailianError(localize(BEIJING_ONLY_MESSAGE), ExitCode.USAGE);
}

export type SpecializedVideoUrlExtractor = (task: DashScopeTaskResponse) => string | undefined;

export function extractVideoUrlField(task: DashScopeTaskResponse): string | undefined {
  return task.output.video_url || task.output.results?.[0]?.url;
}

export function extractStyleOutputVideoUrl(task: DashScopeTaskResponse): string | undefined {
  return task.output.output_video_url || extractVideoUrlField(task);
}

type SpecializedLifecycleOptions = {
  endpointPath: string;
  previewRequest: unknown;
  /** Build the live body after any uploads; skipped on dry-run. */
  resolveLiveRequest: () => Promise<unknown>;
  extractVideoUrl: SpecializedVideoUrlExtractor;
  pollInterval?: number;
  download?: string;
  async?: boolean;
};

/** Submit / poll / download lifecycle shared by retalk and style. */
export async function runSpecializedVideoLifecycle<F extends FlagsDef>(
  ctx: CommandContext<F>,
  options: SpecializedLifecycleOptions,
): Promise<void> {
  const { settings } = ctx;
  const localize = ctx.localize;
  const endpoint = ctx.client.url(options.endpointPath);

  if (settings.dryRun) {
    try {
      assertBeijingDashScopeEndpoint(endpoint, localize);
    } catch (error) {
      if (error instanceof BailianError) {
        ctx.output.progress({
          "en-US": `Warning: ${error.message}`,
          "zh-CN": `警告：${error.message}`,
        });
      }
    }
    ctx.output.result({ endpoint, request: options.previewRequest });
    return;
  }

  assertBeijingDashScopeEndpoint(endpoint, localize);

  const liveRequest = await options.resolveLiveRequest();
  const submitted = await ctx.client.requestJson<DashScopeAsyncResponse>({
    path: options.endpointPath,
    method: "POST",
    body: liveRequest,
    async: true,
  });

  const taskId = submitted.output.task_id;
  ctx.output.progress({
    "en-US": `Submitted. task_id=${taskId}`,
    "zh-CN": `已提交。task_id=${taskId}`,
  });

  if (options.async) {
    ctx.output.result({ task_id: taskId, request_id: submitted.request_id });
    return;
  }

  const pollIntervalSec = options.pollInterval ?? 15;
  // Avoid racing the first task lookup right after submit (UNKNOWN can mean "not visible yet").
  await new Promise((resolve) => setTimeout(resolve, pollIntervalSec * 1000));

  const pollTimeoutSec = Math.max(settings.timeout, SPECIALIZED_VIDEO_TIMEOUT_FLOOR_SEC);
  const taskResponse = await pollDashScopeTask(
    {
      ...ctx,
      settings: { ...settings, timeout: pollTimeoutSec },
    },
    taskId,
    { pollInterval: pollIntervalSec },
  );

  const videoUrl = options.extractVideoUrl(taskResponse);
  if (!videoUrl) {
    throw new BailianError(
      localize({
        "en-US": `Task succeeded but no video URL was returned. task_id=${taskId}`,
        "zh-CN": `任务成功但未返回视频 URL。task_id=${taskId}`,
      }),
      ExitCode.GENERAL,
      localize({
        "en-US": `Query or re-download with task_id ${taskId}; do not resubmit.`,
        "zh-CN": `请用 task_id ${taskId} 查询或重新下载，勿重新提交。`,
      }),
    );
  }

  const destPath =
    options.download || join(resolveOutputDir(settings, { subDir: "videos" }), `${taskId}.mp4`);
  await downloadDashScopeTaskResult(ctx, taskId, videoUrl, destPath);

  ctx.output.result({
    ...taskResponse,
    task_id: taskId,
    video_url: videoUrl,
    saved: destPath,
  });
}
