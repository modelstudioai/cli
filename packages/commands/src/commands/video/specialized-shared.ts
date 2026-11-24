import {
  BailianError,
  ExitCode,
  resolveOutputDir,
  type Client,
  type CommandContext,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import { join } from "path";
import { existsSync, statSync } from "fs";
import { downloadDashScopeTaskResult, pollDashScopeTask } from "../shared/dashscope-task.ts";
import { hasNonAscii, isHttpUrl } from "../shared/translation.ts";

/** Floor aligned with video edit/ref long-running tasks. */
export const SPECIALIZED_VIDEO_TIMEOUT_FLOOR_SEC = 600;

export function pendingUploadMarker(localPath: string): string {
  return `<local-file:${localPath};pending-upload>`;
}

export function previewMediaUrl(value: string): string {
  return isHttpUrl(value) ? value : pendingUploadMarker(value);
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
  if (isHttpUrl(value)) {
    if (hasNonAscii(value)) {
      return {
        "en-US": `${flagName} URL must not contain non-ASCII characters.`,
        "zh-CN": `${flagName} URL 不能包含非 ASCII 字符。`,
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

export async function resolveMediaUrl(
  client: Client,
  value: string,
  model: string,
): Promise<string> {
  if (isHttpUrl(value)) return value;
  return client.uploadFile(value, model);
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

/** Submit / poll / download lifecycle shared by portrait, style, and retouch. */
export async function runSpecializedVideoLifecycle<F extends FlagsDef>(
  ctx: CommandContext<F>,
  options: SpecializedLifecycleOptions,
): Promise<void> {
  const { settings } = ctx;
  const localize = ctx.localize;
  const endpoint = ctx.client.url(options.endpointPath);

  if (settings.dryRun) {
    ctx.output.result({ endpoint, request: options.previewRequest });
    return;
  }

  const liveRequest = await options.resolveLiveRequest();
  const submitted = await ctx.client.requestJson<DashScopeAsyncResponse>({
    path: options.endpointPath,
    method: "POST",
    body: liveRequest,
    async: true,
  });

  const taskId = submitted.output.task_id;
  if (options.async) {
    ctx.output.result({ task_id: taskId, request_id: submitted.request_id });
    return;
  }

  const pollTimeoutSec = Math.max(settings.timeout, SPECIALIZED_VIDEO_TIMEOUT_FLOOR_SEC);
  const taskResponse = await pollDashScopeTask(
    {
      ...ctx,
      settings: { ...settings, timeout: pollTimeoutSec },
    },
    taskId,
    { pollInterval: options.pollInterval ?? 15 },
  );

  const videoUrl = options.extractVideoUrl(taskResponse);
  if (!videoUrl) {
    throw new BailianError(
      localize({
        "en-US": "Task succeeded but no video URL was returned.",
        "zh-CN": "任务成功但未返回视频 URL。",
      }),
      ExitCode.GENERAL,
    );
  }

  const destPath =
    options.download || join(resolveOutputDir(settings, { subDir: "videos" }), `${taskId}.mp4`);
  await downloadDashScopeTaskResult(ctx, taskId, videoUrl, destPath);

  const result: Record<string, unknown> = {
    ...taskResponse,
    task_id: taskId,
    video_url: videoUrl,
    saved: destPath,
  };
  if (taskResponse.output.output_video_url) {
    result.output_video_url = taskResponse.output.output_video_url;
  }

  ctx.output.result(result);
}
