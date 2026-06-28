import {
  defineCommand,
  requestJson,
  videoGenerateEndpoint,
  taskEndpoint,
  detectOutputFormat,
  type DashScopeVideoRequest,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  resolveOutputDir,
  resolveFileUrl,
  resolveCredential,
  BailianError,
  ExitCode,
  resolveBooleanFlag,
  resolveWatermark,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
import { runConcurrent, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

export default defineCommand({
  description:
    "Generate a video from text or image (happyhorse-1.0-t2v / happyhorse-1.0-i2v / wan2.6-t2v)",
  auth: "apiKey",
  usageArgs: "--prompt <text> [--image <url>] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model ID (default: happyhorse-1.0-t2v, or happyhorse-1.0-i2v with --image)",
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: "Video description",
      required: true,
    },
    image: {
      type: "string",
      valueHint: "<url>",
      description: "Input image URL for image-to-video generation",
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
      description: "Aspect ratio (e.g. 16:9, 9:16, 1:1)",
    },
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
    noWait: { type: "switch", description: "Return task ID immediately without waiting" },
    pollInterval: {
      type: "number",
      valueHint: "<seconds>",
      description: "Polling interval when waiting (default: 5)",
    },
    async: {
      type: "switch",
      description: "Return task ID immediately (agent/CI mode, same as --no-wait)",
    },
  },
  exampleArgs: [
    '--prompt "A person reading a book, static shot"',
    '--prompt "Ocean waves at sunset." --download sunset.mp4',
    '--image https://example.com/cat.png --prompt "Make the cat in the scene move"',
    '--prompt "Mountain landscape" --resolution 720P --duration 5',
    '--prompt "A cat playing with a ball" --watermark false',
  ],
  async run(config, flags) {
    const prompt = flags.prompt;

    const model =
      flags.model ||
      config.defaultVideoModel ||
      (flags.image ? "happyhorse-1.0-i2v" : "happyhorse-1.0-t2v");
    const format = detectOutputFormat(config.output);

    const imageUrl = flags.image;

    // Auto-upload local image file for i2v
    let resolvedImageUrl: string | undefined;
    if (imageUrl) {
      const credential = await resolveCredential(config);
      resolvedImageUrl = await resolveFileUrl(imageUrl, credential.token, model);
    }

    const watermark = resolveWatermark(flags.watermark);
    const promptExtend = resolveBooleanFlag(flags.promptExtend, undefined, "prompt-extend");

    const body: DashScopeVideoRequest = {
      model,
      input: {
        prompt: prompt,
        negative_prompt: flags.negativePrompt || undefined,
        // i2v models (happyhorse-1.0-i2v) require input.media with type 'first_frame'
        ...(resolvedImageUrl
          ? { media: [{ type: "first_frame" as const, url: resolvedImageUrl }] }
          : {}),
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

    if (config.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    // Submit async task(s) — supports --concurrent for parallel generation
    const concurrent = getConcurrency(flags);
    const url = videoGenerateEndpoint(config.baseUrl);

    const responses = await runConcurrent(
      concurrent,
      config,
      () =>
        requestJson<DashScopeAsyncResponse>(config, {
          url,
          method: "POST",
          body,
          async: true,
        }),
      "tasks",
    );

    const taskIds = responses.map((r) => r.output.task_id);

    if (!config.quiet) {
      process.stderr.write(`[Model: ${model}]\n`);
    }

    // --no-wait or --async: return task ID(s) immediately
    if (flags.noWait || config.async) {
      emitResult(taskIds.length === 1 ? { task_id: taskIds[0] } : { task_ids: taskIds }, format);
      return;
    }

    // Poll all tasks concurrently
    const pollInterval = flags.pollInterval ?? 5;

    const pollPromises = taskIds.map((taskId) => {
      const pollUrl = taskEndpoint(config.baseUrl, taskId);
      return poll<DashScopeTaskResponse>(config, {
        url: pollUrl,
        intervalSec: pollInterval,
        timeoutSec: config.timeout,
        isComplete: (d) => (d as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
        isFailed: (d) => (d as DashScopeTaskResponse).output.task_status === "FAILED",
        getStatus: (d) => (d as DashScopeTaskResponse).output.task_status,
        getErrorMessage: (d) => {
          const o = (d as DashScopeTaskResponse).output;
          return o.message || o.code || undefined;
        },
      });
    });

    const results = await Promise.all(pollPromises);

    // Collect video URLs from all results
    const videos: Array<{ taskId: string; videoUrl: string }> = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const videoUrl =
        result.output.video_url || (result.output.results && result.output.results[0]?.url);
      if (videoUrl) {
        videos.push({ taskId: taskIds[i]!, videoUrl });
      }
    }

    if (videos.length === 0) {
      throw new BailianError("All tasks completed but no video URLs returned.", ExitCode.GENERAL);
    }

    // --download: save to file (first video only for explicit path)
    if (flags.download) {
      const destPath = flags.download;
      const { size } = await downloadFile(videos[0]!.videoUrl, destPath, { quiet: config.quiet });

      if (config.quiet) {
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

    // Default: auto-download all to output directory
    const destDir = resolveOutputDir(config, { subDir: "videos" });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { join } = await import("path");

    const saved: Array<{ task_id: string; video_url: string; saved: string }> = [];
    await Promise.all(
      videos.map(async ({ taskId, videoUrl }) => {
        const destPath = join(destDir, `${taskId}.mp4`);
        await downloadFile(videoUrl, destPath, { quiet: config.quiet });
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
