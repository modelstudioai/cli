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
  description: {
    "en-US":
      "Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)",
    "zh-CN": "使用 happyhorse-1.0-video-edit 编辑视频（风格转换、对象替换等）",
  },
  auth: "apiKey",
  usageArgs: "--video <url> --prompt <text> [flags]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Model ID (default: happyhorse-1.0-video-edit)",
        "zh-CN": "模型 ID（默认：happyhorse-1.0-video-edit）",
      },
    },
    video: {
      type: "string",
      valueHint: "<url>",
      description: {
        "en-US": "Input video URL or local file (mp4/mov, 2-10s)",
        "zh-CN": "输入视频 URL 或本地文件（mp4/mov，2–10 秒）",
      },
      required: true,
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": 'Edit instruction (e.g. "Convert the scene to a claymation style")',
        "zh-CN": "编辑指令（例如“将场景转换为黏土动画风格”）",
      },
    },
    refImage: {
      type: "string",
      valueHint: "<url>",
      description: {
        "en-US": "Reference image URL (up to 4, comma-separated)",
        "zh-CN": "参考图片 URL（最多 4 个，以逗号分隔）",
      },
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
        "en-US": "Aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)",
        "zh-CN": "宽高比（16:9、9:16、1:1、4:3、3:4）",
      },
    },
    duration: {
      type: "number",
      valueHint: "<seconds>",
      description: {
        "en-US": "Output video duration in seconds (2-10)",
        "zh-CN": "输出视频时长，单位为秒（2–10）",
      },
    },
    audioSetting: {
      type: "string",
      valueHint: "<mode>",
      description: {
        "en-US": "Audio: auto (default) or origin (keep original)",
        "zh-CN": "音频：auto（默认）或 origin（保留原音频）",
      },
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
      "en-US":
        '--video https://example.com/input.mp4 --prompt "Convert the entire scene to claymation style"',
      "zh-CN": '--video https://example.com/input.mp4 --prompt "将整个场景转换为黏土动画风格"',
    },
    {
      "en-US":
        '--video https://example.com/input.mp4 --prompt "Replace the outfit with the style shown in the image" --ref-image https://example.com/clothes.png',
      "zh-CN":
        '--video https://example.com/input.mp4 --prompt "将服装替换为参考图片中的款式" --ref-image https://example.com/clothes.png',
    },
    {
      "en-US":
        '--video https://example.com/input.mp4 --prompt "Convert to anime style" --resolution 720P --download output.mp4',
      "zh-CN":
        '--video https://example.com/input.mp4 --prompt "转换为动漫风格" --resolution 720P --download output.mp4',
    },
    {
      "en-US":
        '--video https://example.com/input.mp4 --prompt "Put clothes on the kitten in the video" --watermark false',
      "zh-CN":
        '--video https://example.com/input.mp4 --prompt "给视频中的小猫穿上衣服" --watermark false',
    },
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
