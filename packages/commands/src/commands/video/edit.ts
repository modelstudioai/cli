import {
  defineCommand,
  videoGeneratePath,
  taskPath,
  detectOutputFormat,
  type DashScopeVideoEditRequest,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  resolveOutputDir,
  BailianError,
  ExitCode,
  resolveBooleanFlag,
  resolveWatermark,
  ASYNC_FLAG,
  CONCURRENT_FLAG,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
import { runConcurrent, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

export default defineCommand({
  description:
    "Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)",
  auth: "apiKey",
  usageArgs: "--video <url> --prompt <text> [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model ID (default: happyhorse-1.0-video-edit)",
    },
    video: {
      type: "string",
      valueHint: "<url>",
      description: "Input video URL or local file (mp4/mov, 2-10s)",
      required: true,
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: 'Edit instruction (e.g. "Convert the scene to a claymation style")',
    },
    refImage: {
      type: "string",
      valueHint: "<url>",
      description: "Reference image URL (up to 4, comma-separated)",
    },
    negativePrompt: {
      type: "string",
      valueHint: "<text>",
      description: "Negative prompt to exclude unwanted content",
    },
    resolution: {
      type: "string",
      valueHint: "<res>",
      description: "Resolution: 720P or 1080P (default: 1080P)",
    },
    ratio: {
      type: "string",
      valueHint: "<ratio>",
      description: "Aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)",
    },
    duration: {
      type: "number",
      valueHint: "<seconds>",
      description: "Output video duration in seconds (2-10)",
    },
    audioSetting: {
      type: "string",
      valueHint: "<mode>",
      description: "Audio: auto (default) or origin (keep original)",
      choices: ["auto", "origin"] as const,
    },
    promptExtend: {
      type: "boolean",
      valueHint: "<bool>",
      description: BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT,
    },
    watermark: {
      type: "boolean",
      valueHint: "<bool>",
      description: BOOL_FLAG_WATERMARK,
    },
    seed: {
      type: "number",
      valueHint: "<n>",
      description: "Random seed for reproducible generation",
    },
    download: {
      type: "string",
      valueHint: "<path>",
      description: "Save video to file on completion",
    },
    ...ASYNC_FLAG,
    ...CONCURRENT_FLAG,
    pollInterval: {
      type: "number",
      valueHint: "<seconds>",
      description: "Polling interval when waiting (default: 15)",
    },
  },
  exampleArgs: [
    '--video https://example.com/input.mp4 --prompt "Convert the entire scene to claymation style"',
    '--video https://example.com/input.mp4 --prompt "Replace the outfit with the style shown in the image" --ref-image https://example.com/clothes.png',
    '--video https://example.com/input.mp4 --prompt "Convert to anime style" --resolution 720P --download output.mp4',
    '--video https://example.com/input.mp4 --prompt "Put clothes on the kitten in the video" --watermark false',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const videoUrl = flags.video;

    // prompt is optional for video edit per API spec
    const prompt = flags.prompt;

    const model = flags.model || "happyhorse-1.0-video-edit";
    const format = detectOutputFormat(settings.output);

    // Auto-upload local files
    const resolvedVideoUrl = await ctx.client.uploadFile(videoUrl, model);
    // --- Build media array ---
    const media: DashScopeVideoEditRequest["input"]["media"] = [
      { type: "video", url: resolvedVideoUrl },
    ];

    // Support comma-separated reference images
    const refImageArg = flags.refImage;
    if (refImageArg) {
      const images = refImageArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const imgUrl of images) {
        const resolved = await ctx.client.uploadFile(imgUrl, model);
        media.push({ type: "reference_image", url: resolved });
      }
    }

    // --- Build request body ---
    const promptExtend = resolveBooleanFlag(flags.promptExtend, undefined, "prompt-extend");
    const watermark = resolveWatermark(flags.watermark);

    const body: DashScopeVideoEditRequest = {
      model,
      input: {
        prompt: prompt || undefined,
        negative_prompt: flags.negativePrompt || undefined,
        media,
      },
      parameters: {
        resolution: flags.resolution || undefined,
        ratio: flags.ratio || undefined,
        duration: flags.duration || undefined,
        audio_setting: flags.audioSetting || undefined,
        prompt_extend: promptExtend,
        watermark,
        seed: flags.seed,
      },
    };

    if (settings.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    const concurrent = getConcurrency(flags);
    const responses = await runConcurrent(
      concurrent,
      settings,
      () =>
        ctx.client.requestJson<DashScopeAsyncResponse>({
          path: videoGeneratePath(),
          method: "POST",
          body,
          async: true,
        }),
      "tasks",
    );

    const taskIds = responses.map((r) => r.output.task_id);

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}]\n`);
      process.stderr.write("Note: Video editing typically takes 5-8 minutes. Please be patient.\n");
    }

    // --async: return task ID(s) immediately
    if (flags.async) {
      emitResult(taskIds.length === 1 ? { task_id: taskIds[0] } : { task_ids: taskIds }, format);
      return;
    }

    // --- Poll until completion ---
    // Video editing is compute-intensive; default timeout = 600s (10 min)
    const pollInterval = flags.pollInterval ?? 15;
    const editTimeout = Math.max(settings.timeout, 600);

    const results = await Promise.all(
      taskIds.map((taskId) =>
        poll<DashScopeTaskResponse>(ctx.client, settings, {
          url: ctx.client.url(taskPath(taskId)),
          intervalSec: pollInterval,
          timeoutSec: editTimeout,
          isComplete: (d) => (d as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
          isFailed: (d) => (d as DashScopeTaskResponse).output.task_status === "FAILED",
          getStatus: (d) => (d as DashScopeTaskResponse).output.task_status,
          getErrorMessage: (d) => {
            const o = (d as DashScopeTaskResponse).output;
            return o.message || o.code || undefined;
          },
        }),
      ),
    );

    const videos: Array<{ taskId: string; videoUrl: string }> = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const videoUrl =
        result.output.video_url || (result.output.results && result.output.results[0]?.url);
      if (videoUrl) videos.push({ taskId: taskIds[i]!, videoUrl });
    }

    if (videos.length === 0) {
      throw new BailianError("All tasks completed but no video URLs returned.", ExitCode.GENERAL);
    }

    // --download: save to file
    if (flags.download) {
      const destPath = flags.download;
      const { size } = await downloadFile(videos[0]!.videoUrl, destPath, { quiet: settings.quiet });

      if (settings.quiet) {
        emitBare(destPath);
      } else {
        emitResult(
          {
            task_id: videos[0]!.taskId,
            video_url: videos[0]!.videoUrl,
            status: "SUCCEEDED",
            saved: destPath,
            size: formatBytes(size),
          },
          format,
        );
      }
      return;
    }

    // Default: auto-download to output directory
    const path = await import("path");
    const destDir = resolveOutputDir(settings, { subDir: "videos" });
    const saved: Array<{ task_id: string; video_url: string; saved: string }> = [];
    await Promise.all(
      videos.map(async ({ taskId, videoUrl }) => {
        const destPath = path.join(destDir, `${taskId}.mp4`);
        await downloadFile(videoUrl, destPath, { quiet: settings.quiet });
        saved.push({ task_id: taskId, video_url: videoUrl, saved: destPath });
      }),
    );

    if (saved.length === 1) {
      emitResult(saved[0]!, format);
    } else {
      emitResult({ videos: saved, total: saved.length }, format);
    }
  },
});
