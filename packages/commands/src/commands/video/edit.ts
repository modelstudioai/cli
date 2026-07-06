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
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
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
    noWait: { type: "switch", description: "Return task ID immediately without waiting" },
    ...ASYNC_FLAG,
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

    // --- Submit async task ---
    const response = await ctx.client.requestJson<DashScopeAsyncResponse>({
      path: videoGeneratePath(),
      method: "POST",
      body,
      async: true,
    });

    const taskId = response.output.task_id;

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}]\n`);
      process.stderr.write("Note: Video editing typically takes 5-8 minutes. Please be patient.\n");
    }

    // --no-wait or --async: return task ID immediately
    if (flags.noWait || flags.async) {
      emitResult({ task_id: taskId }, format);
      return;
    }

    // --- Poll until completion ---
    // Video editing is compute-intensive; default timeout = 600s (10 min)
    const pollInterval = flags.pollInterval ?? 15;
    const pollUrl = ctx.client.url(taskPath(taskId));
    const editTimeout = Math.max(settings.timeout, 600);

    const result = await poll<DashScopeTaskResponse>(ctx.client, settings, {
      url: pollUrl,
      intervalSec: pollInterval,
      timeoutSec: editTimeout,
      isComplete: (d) => (d as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
      isFailed: (d) => (d as DashScopeTaskResponse).output.task_status === "FAILED",
      getStatus: (d) => (d as DashScopeTaskResponse).output.task_status,
      getErrorMessage: (d) => {
        const o = (d as DashScopeTaskResponse).output;
        return o.message || o.code || undefined;
      },
    });

    const resultVideoUrl =
      result.output.video_url || (result.output.results && result.output.results[0]?.url);

    if (!resultVideoUrl) {
      throw new BailianError("Task completed but no video URL returned.", ExitCode.GENERAL);
    }

    // --download: save to file
    if (flags.download) {
      const destPath = flags.download;
      const { size } = await downloadFile(resultVideoUrl, destPath, { quiet: settings.quiet });

      if (settings.quiet) {
        emitBare(destPath);
      } else {
        emitResult(
          {
            task_id: taskId,
            video_url: resultVideoUrl,
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
    const destPath = path.join(destDir, `${taskId}.mp4`);

    await downloadFile(resultVideoUrl, destPath, { quiet: settings.quiet });

    emitResult({ task_id: taskId, video_url: resultVideoUrl, saved: destPath }, format);
  },
});
