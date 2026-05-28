import {
  defineCommand,
  requestJson,
  videoGenerateEndpoint,
  taskEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type DashScopeVideoEditRequest,
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
  name: "video edit",
  description:
    "Edit a video with happyhorse-1.0-video-edit (style transfer, object replacement, etc.)",
  apiDocs: "/best-practice/wanx/video-edit",
  usage: "bl video edit --video <url> --prompt <text> [flags]",
  options: [
    { flag: "--model <model>", description: "Model ID (default: happyhorse-1.0-video-edit)" },
    {
      flag: "--video <url>",
      description: "Input video URL or local file (mp4/mov, 2-10s)",
      required: true,
    },
    { flag: "--prompt <text>", description: 'Edit instruction (e.g. "将画面转换为黏土风格")' },
    { flag: "--ref-image <url>", description: "Reference image URL (up to 4, comma-separated)" },
    {
      flag: "--negative-prompt <text>",
      description: "Negative prompt to exclude unwanted content",
    },
    { flag: "--resolution <res>", description: "Resolution: 720P or 1080P (default: 1080P)" },
    { flag: "--ratio <ratio>", description: "Aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)" },
    {
      flag: "--duration <seconds>",
      description: "Output video duration in seconds (2-10)",
      type: "number",
    },
    {
      flag: "--audio-setting <mode>",
      description: "Audio: auto (default) or origin (keep original)",
    },
    { flag: "--prompt-extend", description: "Enable prompt intelligent rewriting (default: true)" },
    { flag: "--no-prompt-extend", description: "Disable prompt intelligent rewriting" },
    { flag: "--watermark", description: 'Add "AI生成" watermark' },
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
    'bl video edit --video https://example.com/input.mp4 --prompt "将整个画面转换为黏土风格"',
    'bl video edit --video https://example.com/input.mp4 --prompt "替换衣服为图片中的款式" --ref-image https://example.com/clothes.png',
    'bl video edit --video https://example.com/input.mp4 --prompt "Convert to anime style" --resolution 720P --download output.mp4',
  ],
  async run(config: Config, flags: GlobalFlags) {
    // --- Validate video URL ---
    let videoUrl = flags.video as string | undefined;
    if (!videoUrl) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "Enter the video URL to edit:" });
        if (!hint) {
          process.stderr.write("Video editing cancelled.\n");
          process.exit(1);
        }
        videoUrl = hint;
      } else {
        failIfMissing("video", "bl video edit --video <url> --prompt <text>");
      }
    }

    // --- Prompt ---
    let prompt = flags.prompt as string | undefined;
    if (!prompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "Enter your edit instruction:" });
        if (!hint) {
          process.stderr.write("Video editing cancelled.\n");
          process.exit(1);
        }
        prompt = hint;
      }
      // prompt is optional for video edit per API spec
    }

    const model = (flags.model as string) || "happyhorse-1.0-video-edit";
    const format = detectOutputFormat(config.output);

    // Auto-upload local files
    const credential = await resolveCredential(config);
    const resolvedVideoUrl = await resolveFileUrl(videoUrl!, credential.token, model);
    // --- Build media array ---
    const media: DashScopeVideoEditRequest["input"]["media"] = [
      { type: "video", url: resolvedVideoUrl },
    ];

    // Support comma-separated reference images
    const refImageArg = flags.refImage as string | undefined;
    if (refImageArg) {
      const images = refImageArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const imgUrl of images) {
        const resolved = await resolveFileUrl(imgUrl, credential.token, model);
        media.push({ type: "reference_image", url: resolved });
      }
    }

    // --- Build request body ---
    const promptExtend =
      flags.noPromptExtend === true ? false : flags.promptExtend === true ? true : undefined;

    const body: DashScopeVideoEditRequest = {
      model,
      input: {
        prompt: prompt || undefined,
        negative_prompt: (flags.negativePrompt as string) || undefined,
        media,
      },
      parameters: {
        resolution: (flags.resolution as string) || undefined,
        ratio: (flags.ratio as string) || undefined,
        duration: (flags.duration as number) || undefined,
        audio_setting: (flags.audioSetting as "auto" | "origin") || undefined,
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
      process.stderr.write("Note: Video editing typically takes 5-8 minutes. Please be patient.\n");
    }

    // --no-wait or --async: return task ID immediately
    if (flags.noWait || config.async) {
      emitResult({ task_id: taskId }, format);
      return;
    }

    // --- Poll until completion ---
    // Video editing is compute-intensive; default timeout = 600s (10 min)
    const pollInterval = (flags.pollInterval as number) ?? 15;
    const pollUrl = taskEndpoint(config.baseUrl, taskId);
    const editTimeout = Math.max(config.timeout, 600);

    const result = await poll<DashScopeTaskResponse>(config, {
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
    const path = await import("path");
    const destDir = resolveOutputDir(config, { subDir: "videos" });
    const destPath = path.join(destDir, `${taskId}.mp4`);

    await downloadFile(resultVideoUrl, destPath, { quiet: config.quiet });

    emitResult({ task_id: taskId, video_url: resultVideoUrl, saved: destPath }, format);
  },
});
