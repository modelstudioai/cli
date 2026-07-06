import {
  defineCommand,
  videoGeneratePath,
  taskPath,
  detectOutputFormat,
  type DashScopeVideoRefRequest,
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
    "Reference-to-video generation (happyhorse-1.0-r2v / wan2.6-r2v): multi-subject, multi-shot with voice",
  auth: "apiKey",
  usageArgs: "--prompt <text> --image <url>... [--ref-video <url>...] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model ID (default: happyhorse-1.0-r2v)",
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: "Video description with reference markers (image1, video1, etc.)",
      required: true,
    },
    image: {
      type: "array",
      valueHint: "<url>",
      description: "Reference image URL or local file (repeatable for multiple subjects)",
    },
    refVideo: {
      type: "array",
      valueHint: "<url>",
      description: "Reference video URL or local file (repeatable)",
    },
    imageVoice: {
      type: "array",
      valueHint: "<url>",
      description: "Voice URL for corresponding image (pairs by position)",
    },
    videoVoice: {
      type: "array",
      valueHint: "<url>",
      description: "Voice URL for corresponding ref-video (pairs by position)",
    },
    resolution: {
      type: "string",
      valueHint: "<res>",
      description: "Resolution: 720P or 1080P (default: 1080P)",
    },
    ratio: { type: "string", valueHint: "<ratio>", description: "Aspect ratio (16:9, 9:16, 1:1)" },
    duration: {
      type: "number",
      valueHint: "<seconds>",
      description: "Video duration in seconds (default: 5)",
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
    '--prompt "Image1 running on the grass" --image person.jpg',
    '--prompt "Video 1 plays guitar, Image 1 walks over" --ref-video scene.mp4 --image person.jpg',
    '--prompt "Image 1 speaks" --image person.jpg --image-voice voice.mp3 --resolution 1080P',
    '--prompt "Image 1 and Image 2 have a conversation" --image a.jpg --image b.jpg --image-voice va.mp3 --image-voice vb.mp3',
    '--prompt "Image 1 drinks water" --image person.jpg --watermark false',
  ],
  validate: (f) =>
    !(f.image as string[] | undefined)?.length && !(f.refVideo as string[] | undefined)?.length
      ? "Provide at least one --image or --ref-video."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    const prompt = flags.prompt;

    const images = flags.image || [];
    const refVideos = flags.refVideo || [];

    const imageVoices = flags.imageVoice || [];
    const videoVoices = flags.videoVoice || [];

    const model = flags.model || "happyhorse-1.0-r2v";
    const format = detectOutputFormat(settings.output);

    // --- Resolve file URLs (auto-upload local files) ---
    const media: DashScopeVideoRefRequest["input"]["media"] = [];

    // Add reference images
    for (let i = 0; i < images.length; i++) {
      const resolved = await ctx.client.uploadFile(images[i]!, model);
      const entry: DashScopeVideoRefRequest["input"]["media"][number] = {
        type: "reference_image",
        url: resolved,
      };

      // Pair voice by position
      if (imageVoices[i]) {
        const resolvedVoice = await ctx.client.uploadFile(imageVoices[i]!, model);
        entry.reference_voice = resolvedVoice;
      }

      media.push(entry);
    }

    // Add reference videos
    for (let i = 0; i < refVideos.length; i++) {
      const resolved = await ctx.client.uploadFile(refVideos[i]!, model);
      const entry: DashScopeVideoRefRequest["input"]["media"][number] = {
        type: "reference_video",
        url: resolved,
      };

      // Pair voice by position
      if (videoVoices[i]) {
        const resolvedVoice = await ctx.client.uploadFile(videoVoices[i]!, model);
        entry.reference_voice = resolvedVoice;
      }

      media.push(entry);
    }

    // --- Build request body ---
    const promptExtend = resolveBooleanFlag(flags.promptExtend, undefined, "prompt-extend");
    const watermark = resolveWatermark(flags.watermark);

    const body: DashScopeVideoRefRequest = {
      model,
      input: {
        prompt: prompt,
        media,
      },
      parameters: {
        resolution: flags.resolution || undefined,
        ratio: flags.ratio || undefined,
        duration: flags.duration || undefined,
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
      process.stderr.write(
        `Note: Reference-to-video typically takes 5-10 minutes. Please be patient.\n`,
      );
    }

    // --async: return task ID(s) immediately
    if (flags.async) {
      emitResult(taskIds.length === 1 ? { task_id: taskIds[0] } : { task_ids: taskIds }, format);
      return;
    }

    // --- Poll until completion ---
    const pollInterval = flags.pollInterval ?? 15;
    const refTimeout = Math.max(settings.timeout, 600);

    const results = await Promise.all(
      taskIds.map((taskId) =>
        poll<DashScopeTaskResponse>(ctx.client, settings, {
          url: ctx.client.url(taskPath(taskId)),
          intervalSec: pollInterval,
          timeoutSec: refTimeout,
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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { join } = await import("path");
    const destDir = resolveOutputDir(settings, { subDir: "videos" });
    const saved: Array<{ task_id: string; video_url: string; saved: string }> = [];
    await Promise.all(
      videos.map(async ({ taskId, videoUrl }) => {
        const destPath = join(destDir, `${taskId}.mp4`);
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
