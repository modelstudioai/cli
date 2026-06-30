import {
  defineCommand,
  requestJson,
  videoGenerateEndpoint,
  taskEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type DashScopeVideoRequest,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  isInteractive,
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
import { promptText, failIfMissing, cmdUsage } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

export default defineCommand({
  description:
    "Generate a video from text or image (happyhorse-1.1-t2v / happyhorse-1.1-i2v / wan2.6-t2v)",
  usageArgs: "--prompt <text> [--image <url>] [flags]",
  options: [
    {
      flag: "--model <model>",
      description: "Model ID (default: happyhorse-1.1-t2v, or happyhorse-1.1-i2v with --image)",
    },
    { flag: "--prompt <text>", description: "Video description", required: true },
    { flag: "--image <url>", description: "Input image URL for image-to-video generation" },
    {
      flag: "--negative-prompt <text>",
      description: "Negative prompt to exclude unwanted content",
    },
    { flag: "--resolution <res>", description: "Resolution: 720P or 1080P (default: 1080P)" },
    { flag: "--ratio <ratio>", description: "Aspect ratio (e.g. 16:9, 9:16, 1:1)" },
    {
      flag: "--duration <seconds>",
      description: "Video duration in seconds (default: 5)",
      type: "number",
    },
    {
      flag: "--prompt-extend <bool>",
      description: BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT,
    },
    {
      flag: "--watermark <bool>",
      description: BOOL_FLAG_WATERMARK,
    },
    { flag: "--seed <n>", description: "Random seed for reproducible generation", type: "number" },
    { flag: "--download <path>", description: "Save video to file on completion" },
    { flag: "--no-wait", description: "Return task ID immediately without waiting" },
    {
      flag: "--async",
      description: "Return task ID immediately (agent/CI mode, same as --no-wait)",
    },
    {
      flag: "--poll-interval <seconds>",
      description: "Polling interval when waiting (default: 5)",
      type: "number",
    },
  ],
  exampleArgs: [
    '--prompt "A person reading a book, static shot"',
    '--prompt "Ocean waves at sunset." --download sunset.mp4',
    '--image https://example.com/cat.png --prompt "Make the cat in the scene move"',
    '--prompt "Mountain landscape" --resolution 720P --duration 5',
    '--prompt "A cat playing with a ball" --watermark false',
  ],
  async run(config: Config, flags: GlobalFlags) {
    let prompt = flags.prompt as string | undefined;

    if (!prompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: "Enter your video prompt:" });
        if (!hint) {
          process.stderr.write("Video generation cancelled.\n");
          process.exit(1);
        }
        prompt = hint;
      } else {
        failIfMissing("prompt", cmdUsage(config, "--prompt <text>"));
      }
    }

    const model =
      (flags.model as string) ||
      config.defaultVideoModel ||
      ((flags.image as string) ? "happyhorse-1.1-i2v" : "happyhorse-1.1-t2v");
    const format = detectOutputFormat(config.output);

    const imageUrl = flags.image as string | undefined;

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
        prompt: prompt!,
        negative_prompt: (flags.negativePrompt as string) || undefined,
        // i2v models (happyhorse-1.1-i2v) require input.media with type 'first_frame'
        ...(resolvedImageUrl
          ? { media: [{ type: "first_frame" as const, url: resolvedImageUrl }] }
          : {}),
      },
      parameters: {
        resolution: (flags.resolution as string) || undefined,
        ratio: (flags.ratio as string) || undefined,
        duration: (flags.duration as number) || undefined,
        prompt_extend: promptExtend,
        watermark,
        seed: flags.seed as number | undefined,
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
    const pollInterval = (flags.pollInterval as number) ?? 5;

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
      const destPath = flags.download as string;
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
