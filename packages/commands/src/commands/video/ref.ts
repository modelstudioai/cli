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
      "Reference-to-video generation (wan3.0-video / happyhorse-1.1-r2v / wan2.6-r2v): multi-subject, multi-shot with voice",
    "zh-CN":
      "参考生视频（wan3.0-video / happyhorse-1.1-r2v / wan2.6-r2v）：支持多主体、多镜头和语音",
  },
  auth: "apiKey",
  usageArgs: "--prompt <text> --image <url>... [--ref-video <url>...] [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model ID (default: wan3.0-video)",
        "zh-CN": "模型 ID（默认：wan3.0-video）",
      },
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Video description with reference markers (image1, video1, etc.)",
        "zh-CN": "包含引用标记的视频描述（image1、video1 等）",
      },
      required: true,
    },
    image: {
      type: "array",
      valueHint: "<url>",
      description: {
        "en-US": "Reference image URL or local file (repeatable for multiple subjects)",
        "zh-CN": "参考图片 URL 或本地文件（多个主体时可重复）",
      },
    },
    refVideo: {
      type: "array",
      valueHint: "<url>",
      description: {
        "en-US": "Reference video URL or local file (repeatable)",
        "zh-CN": "参考视频 URL 或本地文件（可重复）",
      },
    },
    imageVoice: {
      type: "array",
      valueHint: "<url>",
      description: {
        "en-US":
          "Voice URL for corresponding image (pairs by position). On wan3.0-video emitted as reference_audio (refer to Audio 1, Audio 2 in prompt)",
        "zh-CN":
          "对应图片的语音 URL（按位置配对）。在 wan3.0-video 上作为 reference_audio 条目发送（prompt 中用「音频1」「音频2」引用）",
      },
    },
    videoVoice: {
      type: "array",
      valueHint: "<url>",
      description: {
        "en-US":
          "Voice URL for corresponding ref-video (pairs by position). On wan3.0-video emitted as reference_audio (refer to Audio 1, Audio 2 in prompt)",
        "zh-CN":
          "对应参考视频的语音 URL（按位置配对）。在 wan3.0-video 上作为 reference_audio 条目发送（prompt 中用「音频1」「音频2」引用）",
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
        "en-US": "Aspect ratio (16:9, 9:16, 1:1)",
        "zh-CN": "宽高比（16:9、9:16、1:1）",
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
        "en-US": "Polling interval when waiting (default: 15)",
        "zh-CN": "等待任务时的轮询间隔（默认：15 秒）",
      },
    },
  },
  exampleArgs: [
    {
      "en-US": '--prompt "Image1 running on the grass" --image person.jpg',
      "zh-CN": '--prompt "图片 1 中的人物在草地上奔跑" --image person.jpg',
    },
    {
      "en-US":
        '--prompt "Video 1 plays guitar, Image 1 walks over" --ref-video scene.mp4 --image person.jpg',
      "zh-CN":
        '--prompt "视频 1 中的人物弹吉他，图片 1 中的人物走过来" --ref-video scene.mp4 --image person.jpg',
    },
    {
      "en-US":
        '--prompt "Image 1 speaks" --image person.jpg --image-voice voice.mp3 --resolution 1080P',
      "zh-CN":
        '--prompt "图片 1 中的人物说话" --image person.jpg --image-voice voice.mp3 --resolution 1080P',
    },
    {
      "en-US":
        '--prompt "Image 1 and Image 2 have a conversation" --image a.jpg --image b.jpg --image-voice va.mp3 --image-voice vb.mp3',
      "zh-CN":
        '--prompt "图片 1 和图片 2 中的人物进行对话" --image a.jpg --image b.jpg --image-voice va.mp3 --image-voice vb.mp3',
    },
    {
      "en-US": '--prompt "Image 1 drinks water" --image person.jpg --watermark false',
      "zh-CN": '--prompt "图片 1 中的人物喝水" --image person.jpg --watermark false',
    },
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

    const model = flags.model || settings.defaultReferenceToVideoModel || "wan3.0-video";
    const format = detectOutputFormat(settings.output);

    // wan3.0-video emits voice as standalone reference_audio entries (referenced as Audio 1, Audio 2 in prompt);
    // other models (wan2.7-r2v / happyhorse-1.1-r2v, etc.) keep the legacy reference_voice field attached to each asset.
    const useReferenceAudio = /^wan3\./i.test(model);

    // --- Resolve file URLs (auto-upload local files) ---
    const media: DashScopeVideoRefRequest["input"]["media"] = [];
    const audioEntries: Array<{ type: "reference_audio"; url: string }> = [];

    // Add reference images
    for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
      const resolved = await ctx.client.resolveImageInput(images[imageIndex]!, model);
      const entry: DashScopeVideoRefRequest["input"]["media"][number] = {
        type: "reference_image",
        url: resolved,
      };

      // Pair voice by position
      if (imageVoices[imageIndex]) {
        const resolvedVoice = await ctx.client.uploadFile(imageVoices[imageIndex]!, model);
        if (useReferenceAudio) {
          audioEntries.push({ type: "reference_audio", url: resolvedVoice });
        } else {
          entry.reference_voice = resolvedVoice;
        }
      }

      media.push(entry);
    }

    // Add reference videos
    for (let videoIndex = 0; videoIndex < refVideos.length; videoIndex++) {
      const resolved = await ctx.client.uploadFile(refVideos[videoIndex]!, model);
      const entry: DashScopeVideoRefRequest["input"]["media"][number] = {
        type: "reference_video",
        url: resolved,
      };

      // Pair voice by position
      if (videoVoices[videoIndex]) {
        const resolvedVoice = await ctx.client.uploadFile(videoVoices[videoIndex]!, model);
        if (useReferenceAudio) {
          audioEntries.push({ type: "reference_audio", url: resolvedVoice });
        } else {
          entry.reference_voice = resolvedVoice;
        }
      }

      media.push(entry);
    }

    // wan3.0: append reference voices as standalone media entries, ordered image-voice then video-voice (Audio 1, Audio 2, ...)
    if (useReferenceAudio) {
      for (const audioEntry of audioEntries) {
        media.push(audioEntry);
      }
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
      const previewBody = {
        ...body,
        input: {
          ...body.input,
          media: body.input.media.map((item) => ({
            ...item,
            url: redactDataUri(item.url),
            reference_voice: item.reference_voice ? redactDataUri(item.reference_voice) : undefined,
          })),
        },
      };
      emitResult({ request: previewBody }, format);
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
    for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
      const result = results[resultIndex]!;
      const videoUrl =
        result.output.video_url || (result.output.results && result.output.results[0]?.url);
      if (videoUrl) videos.push({ taskId: taskIds[resultIndex]!, videoUrl });
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
