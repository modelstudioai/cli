import {
  defineCommand,
  videoGeneratePath,
  image2videoPath,
  taskPath,
  detectOutputFormat,
  type DashScopeVideoRequest,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  resolveOutputDir,
  BailianError,
  ExitCode,
  resolveBooleanFlag,
  resolveWatermark,
  ASYNC_FLAG,
  CONCURRENT_FLAG,
  redactDataUri,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile, formatBytes } from "bailian-cli-runtime";
import { runConcurrent, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US":
      "Generate a video from text or image (happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v)",
    "zh-CN": "根据文本或图片生成视频（happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v）",
  },
  auth: "apiKey",
  usageArgs: "--prompt <text> [--image <url>] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model ID (default: happyhorse-1.1-t2v, or happyhorse-1.1-i2v with --image)",
        "zh-CN": "模型 ID（默认：happyhorse-1.1-t2v；使用 --image 时为 happyhorse-1.1-i2v）",
      },
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: { "en-US": "Video description", "zh-CN": "视频描述" },
      required: true,
    },
    image: {
      type: "string",
      valueHint: "<url>",
      description: {
        "en-US": "Input image URL for image-to-video generation",
        "zh-CN": "图生视频使用的输入图片 URL",
      },
    },
    lastFrame: {
      type: "string",
      valueHint: "<url>",
      description: "Last frame image URL (with --image, enables kf2v first+last frame mode)",
    },
    negativePrompt: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Negative prompt to exclude unwanted content",
        "zh-CN": "负向提示词，用于排除不需要的内容",
      },
    },
    resolution: {
      type: "string",
      valueHint: "<res>",
      description: {
        "en-US": "Resolution: 720P or 1080P (default: 1080P)",
        "zh-CN": "分辨率：720P 或 1080P（默认：1080P）",
      },
    },
    ratio: {
      type: "string",
      valueHint: "<ratio>",
      description: {
        "en-US": "Aspect ratio (e.g. 16:9, 9:16, 1:1)",
        "zh-CN": "宽高比（例如 16:9、9:16、1:1）",
      },
    },
    duration: {
      type: "number",
      valueHint: "<seconds>",
      description: {
        "en-US": "Video duration in seconds (default: 5)",
        "zh-CN": "视频时长，单位为秒（默认：5）",
      },
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
      description: {
        "en-US": "Random seed for reproducible generation",
        "zh-CN": "用于复现生成结果的随机种子",
      },
    },
    download: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": "Save video to file on completion",
        "zh-CN": "完成后将视频保存到文件",
      },
    },
    ...ASYNC_FLAG,
    ...CONCURRENT_FLAG,
    pollInterval: {
      type: "number",
      valueHint: "<seconds>",
      description: {
        "en-US": "Polling interval when waiting (default: 5)",
        "zh-CN": "等待任务时的轮询间隔（默认：5 秒）",
      },
    },
  },
  exampleArgs: [
    {
      "en-US": '--prompt "A person reading a book, static shot"',
      "zh-CN": '--prompt "一个人正在读书，固定镜头"',
    },
    {
      "en-US": '--prompt "Ocean waves at sunset." --download sunset.mp4',
      "zh-CN": '--prompt "日落时的海浪。" --download sunset.mp4',
    },
    {
      "en-US": '--image https://example.com/cat.png --prompt "Make the cat in the scene move"',
      "zh-CN": '--image https://example.com/cat.png --prompt "让画面中的猫动起来"',
    },
    {
      "en-US": '--prompt "Mountain landscape" --resolution 720P --duration 5',
      "zh-CN": '--prompt "山地景观" --resolution 720P --duration 5',
    },
    {
      "en-US": '--prompt "A cat playing with a ball" --watermark false',
      "zh-CN": '--prompt "一只正在玩球的猫" --watermark false',
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const prompt = flags.prompt;

    const model =
      flags.model ||
      (flags.image
        ? settings.defaultImageToVideoModel || "happyhorse-1.1-i2v"
        : settings.defaultVideoModel || "happyhorse-1.1-t2v");
    const format = detectOutputFormat(settings.output);

    const imageUrl = flags.image;
    const lastFrameUrl = flags.lastFrame as string | undefined;

    // Auto-upload local image file for i2v
    let resolvedImageUrl: string | undefined;
    if (imageUrl) {
      resolvedImageUrl = await ctx.client.resolveImageInput(imageUrl, model);
    }
    let resolvedLastFrameUrl: string | undefined;
    if (lastFrameUrl) {
      resolvedLastFrameUrl = await ctx.client.resolveImageInput(lastFrameUrl, model);
    }

    // kf2v mode: both --image and --last-frame provided.
    const isKf2v = Boolean(resolvedImageUrl && resolvedLastFrameUrl);

    const watermark = resolveWatermark(flags.watermark);
    const promptExtend = resolveBooleanFlag(flags.promptExtend, undefined, "prompt-extend");

    const body: DashScopeVideoRequest = {
      model,
      input: {
        prompt: prompt,
        negative_prompt: flags.negativePrompt || undefined,
        // kf2v: first+last frame flat fields via image2video endpoint.
        // wan2.1~2.6 i2v: flat img_url via video-generation endpoint.
        // wan2.7+ / happyhorse i2v: media[] via video-generation endpoint.
        ...(isKf2v
          ? { first_frame_url: resolvedImageUrl, last_frame_url: resolvedLastFrameUrl }
          : resolvedImageUrl
            ? /wan[x]?2\.[1-6]/i.test(model)
              ? { img_url: resolvedImageUrl }
              : { media: [{ type: "first_frame" as const, url: resolvedImageUrl }] }
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

    if (settings.dryRun) {
      let previewBody = body;
      if (isKf2v) {
        previewBody = {
          ...body,
          input: {
            ...body.input,
            first_frame_url: redactDataUri(resolvedImageUrl ?? ""),
            last_frame_url: redactDataUri(resolvedLastFrameUrl ?? ""),
          },
        };
      } else if (resolvedImageUrl) {
        const redactedUrl = redactDataUri(resolvedImageUrl);
        previewBody = {
          ...body,
          input: {
            ...body.input,
            ...(/wan[x]?2\.[1-6]/i.test(model)
              ? { img_url: redactedUrl }
              : { media: [{ type: "first_frame" as const, url: redactedUrl }] }),
          },
        };
      }
      emitResult({ request: previewBody }, format);
      return;
    }

    // Submit async task(s) — supports --concurrent for parallel generation
    const concurrent = getConcurrency(flags);

    const responses = await runConcurrent(
      concurrent,
      settings,
      () =>
        ctx.client.requestJson<DashScopeAsyncResponse>({
          path: isKf2v ? image2videoPath() : videoGeneratePath(),
          method: "POST",
          body,
          async: true,
        }),
      "tasks",
    );

    const taskIds = responses.map((r) => r.output.task_id);

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}]\n`);
    }

    // --async: return task ID(s) immediately
    if (flags.async) {
      emitResult(taskIds.length === 1 ? { task_id: taskIds[0] } : { task_ids: taskIds }, format);
      return;
    }

    // Poll all tasks concurrently
    const pollInterval = flags.pollInterval ?? 5;

    const pollPromises = taskIds.map((taskId) => {
      const pollUrl = ctx.client.url(taskPath(taskId));
      return poll<DashScopeTaskResponse>(ctx.client, settings, {
        url: pollUrl,
        intervalSec: pollInterval,
        timeoutSec: settings.timeout,
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
      const { size } = await downloadFile(videos[0]!.videoUrl, destPath, {
        quiet: settings.quiet,
      });

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

    // Default: auto-download all to output directory
    const destDir = resolveOutputDir(settings, { subDir: "videos" });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { join } = await import("path");

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
