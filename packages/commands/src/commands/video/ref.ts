import {
  defineCommand,
  requestJson,
  videoGenerateEndpoint,
  taskEndpoint,
  detectOutputFormat,
  type DashScopeVideoRefRequest,
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
    noWait: { type: "switch", description: "Return task ID immediately without waiting" },
    pollInterval: {
      type: "number",
      valueHint: "<seconds>",
      description: "Polling interval when waiting (default: 15)",
    },
    async: {
      type: "switch",
      description: "Return task ID immediately (agent/CI mode, same as --no-wait)",
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
  async run(config, flags) {
    const prompt = flags.prompt;

    const images = flags.image || [];
    const refVideos = flags.refVideo || [];

    const imageVoices = flags.imageVoice || [];
    const videoVoices = flags.videoVoice || [];

    const model = flags.model || "happyhorse-1.0-r2v";
    const format = detectOutputFormat(config.output);

    // --- Resolve file URLs (auto-upload local files) ---
    const credential = await resolveCredential(config);
    const media: DashScopeVideoRefRequest["input"]["media"] = [];

    // Add reference images
    for (let i = 0; i < images.length; i++) {
      const resolved = await resolveFileUrl(images[i]!, credential.token, model);
      const entry: DashScopeVideoRefRequest["input"]["media"][number] = {
        type: "reference_image",
        url: resolved,
      };

      // Pair voice by position
      if (imageVoices[i]) {
        const resolvedVoice = await resolveFileUrl(imageVoices[i]!, credential.token, model);
        entry.reference_voice = resolvedVoice;
      }

      media.push(entry);
    }

    // Add reference videos
    for (let i = 0; i < refVideos.length; i++) {
      const resolved = await resolveFileUrl(refVideos[i]!, credential.token, model);
      const entry: DashScopeVideoRefRequest["input"]["media"][number] = {
        type: "reference_video",
        url: resolved,
      };

      // Pair voice by position
      if (videoVoices[i]) {
        const resolvedVoice = await resolveFileUrl(videoVoices[i]!, credential.token, model);
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

    if (config.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    // --- Submit async task ---
    const url = videoGenerateEndpoint(config.baseUrl);
    const response = await requestJson<DashScopeAsyncResponse>(config, {
      url,
      method: "POST",
      body,
      async: true,
    });

    const taskId = response.output.task_id;

    if (!config.quiet) {
      process.stderr.write(`[Model: ${model}]\n`);
      process.stderr.write(
        `Note: Reference-to-video typically takes 5-10 minutes. Please be patient.\n`,
      );
    }

    // --no-wait or --async: return task ID immediately
    if (flags.noWait || config.async) {
      emitResult({ task_id: taskId }, format);
      return;
    }

    // --- Poll until completion ---
    const pollInterval = flags.pollInterval ?? 15;
    const pollUrl = taskEndpoint(config.baseUrl, taskId);
    const refTimeout = Math.max(config.timeout, 600);

    const result = await poll<DashScopeTaskResponse>(config, {
      url: pollUrl,
      intervalSec: pollInterval,
      timeoutSec: refTimeout,
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
      const { size } = await downloadFile(resultVideoUrl, destPath, { quiet: config.quiet });

      if (config.quiet) {
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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { join } = await import("path");
    const destDir = resolveOutputDir(config, { subDir: "videos" });
    const destPath = join(destDir, `${taskId}.mp4`);

    await downloadFile(resultVideoUrl, destPath, { quiet: config.quiet });

    emitResult({ task_id: taskId, video_url: resultVideoUrl, saved: destPath }, format);
  },
});
