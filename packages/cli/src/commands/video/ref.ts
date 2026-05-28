import {
  defineCommand,
  requestJson,
  videoGenerateEndpoint,
  taskEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type DashScopeVideoRefRequest,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  isInteractive,
  resolveOutputDir,
  resolveFileUrl,
  resolveCredential,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { poll } from "../../utils/polling.ts";
import { downloadFile, formatBytes } from "../../utils/download.ts";
import { promptText, failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "video ref",
  description:
    "Reference-to-video generation (happyhorse-1.0-r2v / wan2.6-r2v): multi-subject, multi-shot with voice",
  apiDocs: "/best-practice/wanx/video-reference",
  usage: "bl video ref --prompt <text> --image <url>... [--ref-video <url>...] [flags]",
  options: [
    { flag: "--model <model>", description: "Model ID (default: happyhorse-1.0-r2v)" },
    {
      flag: "--prompt <text>",
      description: "Video description with reference markers (图1, 视频1, etc.)",
      required: true,
    },
    {
      flag: "--image <url>",
      description: "Reference image URL or local file (repeatable for multiple subjects)",
      type: "array",
    },
    {
      flag: "--ref-video <url>",
      description: "Reference video URL or local file (repeatable)",
      type: "array",
    },
    {
      flag: "--image-voice <url>",
      description: "Voice URL for corresponding image (pairs by position)",
      type: "array",
    },
    {
      flag: "--video-voice <url>",
      description: "Voice URL for corresponding ref-video (pairs by position)",
      type: "array",
    },
    { flag: "--resolution <res>", description: "Resolution: 720P or 1080P (default: 720P)" },
    { flag: "--ratio <ratio>", description: "Aspect ratio (16:9, 9:16, 1:1)" },
    {
      flag: "--duration <seconds>",
      description: "Video duration in seconds (2-10, default: 5)",
      type: "number",
    },
    { flag: "--prompt-extend", description: "Enable prompt intelligent rewriting" },
    { flag: "--no-prompt-extend", description: "Disable prompt intelligent rewriting" },
    { flag: "--watermark", description: "Add watermark to generated video" },
    { flag: "--seed <n>", description: "Random seed for reproducible generation", type: "number" },
    { flag: "--download <path>", description: "Save video to file on completion" },
    { flag: "--no-wait", description: "Return task ID immediately without waiting" },
    {
      flag: "--async",
      description: "Return task ID immediately (agent/CI mode, same as --no-wait)",
    },
    {
      flag: "--poll-interval <seconds>",
      description: "Polling interval when waiting (default: 15)",
      type: "number",
    },
  ],
  examples: [
    'bl video ref --prompt "图1在草地上奔跑" --image person.jpg',
    'bl video ref --prompt "视频1在弹吉他，图1走过来" --ref-video scene.mp4 --image person.jpg',
    'bl video ref --prompt "图1说话" --image person.jpg --image-voice voice.mp3 --resolution 1080P',
    'bl video ref --prompt "图1和图2在对话" --image a.jpg --image b.jpg --image-voice va.mp3 --image-voice vb.mp3',
  ],
  async run(config: Config, flags: GlobalFlags) {
    // --- Validate prompt ---
    let prompt = flags.prompt as string | undefined;
    if (!prompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({
          message: "Enter your video prompt (use 图1, 视频1 to reference inputs):",
        });
        if (!hint) {
          process.stderr.write("Video generation cancelled.\n");
          process.exit(1);
        }
        prompt = hint;
      } else {
        failIfMissing("prompt", "bl video ref --prompt <text> --image <url>");
      }
    }

    const images = (flags.image as string[] | undefined) || [];
    const refVideos = (flags.refVideo as string[] | undefined) || [];

    if (images.length === 0 && refVideos.length === 0) {
      throw new BailianError(
        "At least one --image or --ref-video is required.",
        ExitCode.USAGE,
        'bl video ref --prompt "描述" --image person.jpg',
      );
    }

    const imageVoices = (flags.imageVoice as string[] | undefined) || [];
    const videoVoices = (flags.videoVoice as string[] | undefined) || [];

    const model = (flags.model as string) || "happyhorse-1.0-r2v";
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
    const promptExtend =
      flags.noPromptExtend === true ? false : flags.promptExtend === true ? true : undefined;

    const body: DashScopeVideoRefRequest = {
      model,
      input: {
        prompt: prompt!,
        media,
      },
      parameters: {
        resolution: (flags.resolution as string) || undefined,
        ratio: (flags.ratio as string) || undefined,
        duration: (flags.duration as number) || undefined,
        prompt_extend: promptExtend,
        watermark: flags.watermark === true ? true : undefined,
        seed: flags.seed as number | undefined,
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
    const pollInterval = (flags.pollInterval as number) ?? 15;
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
      const destPath = flags.download as string;
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
