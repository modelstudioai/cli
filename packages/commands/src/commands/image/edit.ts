import {
  defineCommand,
  imagePath,
  imageSyncPath,
  taskPath,
  detectOutputFormat,
  resolveOutputDir,
  generateFilename,
  stripUndefined,
  type Client,
  type DashScopeImageRequest,
  type DashScopeImageSyncResponse,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  type FlagsDef,
  type OutputFormat,
  type ParsedFlags,
  type Settings,
  ExitCode,
  BailianError,
  resolveBooleanFlag,
  resolveWatermark,
  ASYNC_FLAG,
  CONCURRENT_FLAG,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile } from "bailian-cli-runtime";
import { runConcurrent, downloadParallel, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveImageSize } from "bailian-cli-runtime";
import { join } from "path";
import { BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

const SYNC_MODEL_PREFIXES = ["qwen-image-2.0", "qwen-image-max"];

function isSyncModel(model: string): boolean {
  return SYNC_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

const EDIT_FLAGS = {
  image: {
    type: "array",
    valueHint: "<url>",
    description: "Source image URL or local file path (repeatable for multi-image merge)",
    required: true,
  },
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: "Edit instruction text",
    required: true,
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: "Model ID (default: qwen-image-2.0)",
  },
  size: {
    type: "string",
    valueHint: "<W*H>",
    description: "Output image size: ratio (3:4, 16:9) or pixels (2048*2048)",
  },
  n: {
    type: "number",
    valueHint: "<count>",
    description: "Number of images (default: 1, max: 6)",
  },
  seed: { type: "number", valueHint: "<n>", description: "Random seed for reproducible results" },
  negativePrompt: {
    type: "string",
    valueHint: "<text>",
    description: "Negative prompt to exclude unwanted content",
  },
  promptExtend: {
    type: "boolean",
    valueHint: "<bool>",
    description: BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE,
  },
  watermark: {
    type: "boolean",
    valueHint: "<bool>",
    description: BOOL_FLAG_WATERMARK,
  },
  outDir: { type: "string", valueHint: "<dir>", description: "Download images to directory" },
  outPrefix: {
    type: "string",
    valueHint: "<prefix>",
    description: "Filename prefix (default: edited)",
  },
  ...ASYNC_FLAG,
  ...CONCURRENT_FLAG,
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: "Polling interval when waiting (default: 3)",
  },
} satisfies FlagsDef;
type EditFlags = ParsedFlags<typeof EDIT_FLAGS>;

export default defineCommand({
  description: "Edit an existing image with text instructions (Qwen-Image)",
  auth: "apiKey",
  usageArgs: "--image <url> --prompt <text> [flags]",
  flags: EDIT_FLAGS,
  exampleArgs: [
    '--image ./photo.png --prompt "Replace the background with a beach"',
    '--image https://example.com/logo.png --prompt "Change color to blue" --n 3',
    '--image ./a.png --image ./b.png --prompt "Merge two images into one collage"',
    '--image https://example.com/photo.png --prompt "Remove the person" --model qwen-image-2.0-pro',
    '--image ./photo.png --prompt "Replace the background with a beach" --watermark false',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    // Normalize --image to string array (supports both single and repeated flags)
    let rawImages: string[] = [];
    if (Array.isArray(flags.image)) {
      rawImages = flags.image;
    } else if (typeof flags.image === "string") {
      rawImages = [flags.image];
    }
    const prompt = flags.prompt;

    const model = flags.model || settings.defaultImageModel || "qwen-image-2.0";
    const useSync = isSyncModel(model);

    // Auto-upload local files (resolve all images in parallel)
    const resolvedImages = await Promise.all(
      rawImages.map((img) => ctx.client.uploadFile(img, model)),
    );
    const n = flags.n ?? 1;

    const promptExtend = resolveBooleanFlag(
      flags.promptExtend,
      useSync ? true : undefined,
      "prompt-extend",
    );

    // Build content: all images first, then text prompt
    const contentItems: Array<{ image?: string; text?: string }> = resolvedImages.map(
      (u: string) => ({ image: u }),
    );
    contentItems.push({ text: prompt });

    const watermark = resolveWatermark(flags.watermark);

    const body: DashScopeImageRequest = {
      model,
      input: {
        messages: [
          {
            role: "user",
            content: contentItems,
          },
        ],
      },
      parameters: {
        size: resolveImageSize(flags.size, useSync),
        n,
        seed: flags.seed,
        prompt_extend: promptExtend,
        watermark,
        negative_prompt: flags.negativePrompt || undefined,
      },
    };

    // Remove undefined parameters
    stripUndefined(body.parameters as Record<string, unknown>);

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ request: body, mode: useSync ? "sync" : "async" }, format);
      return;
    }

    if (!settings.quiet) {
      process.stderr.write(
        `[Model: ${model}] [Mode: ${useSync ? "sync" : "async"}] [Images: ${resolvedImages.length}]\n`,
      );
    }

    const concurrent = getConcurrency(flags);

    if (useSync) {
      await handleSyncMode(ctx.client, settings, body, flags, format, concurrent);
    } else {
      await handleAsyncMode(ctx.client, settings, body, flags, format, concurrent);
    }
  },
});

async function handleSyncMode(
  client: Client,
  settings: Settings,
  body: DashScopeImageRequest,
  flags: EditFlags,
  format: OutputFormat,
  concurrent: number,
): Promise<void> {
  const results = await runConcurrent(concurrent, settings, () =>
    client.requestJson<DashScopeImageSyncResponse>({
      path: imageSyncPath(),
      method: "POST",
      body,
    }),
  );

  const imageUrls = results
    .flatMap((r) => r.output.choices || [])
    .flatMap((c) => c.message?.content || [])
    .map((item) => item.image)
    .filter(Boolean);

  if (imageUrls.length === 0) {
    throw new BailianError("Edit completed but no images returned.", ExitCode.GENERAL);
  }

  await saveImages(imageUrls, flags, settings, format);
}

async function handleAsyncMode(
  client: Client,
  settings: Settings,
  body: DashScopeImageRequest,
  flags: EditFlags,
  format: OutputFormat,
  concurrent: number,
): Promise<void> {
  const responses = await runConcurrent(
    concurrent,
    settings,
    () =>
      client.requestJson<DashScopeAsyncResponse>({
        path: imagePath(),
        method: "POST",
        body,
        async: true,
      }),
    "tasks",
  );
  const taskIds = responses.map((r) => r.output.task_id);

  if (flags.async) {
    emitResult({ task_ids: taskIds }, format);
    return;
  }

  const pollInterval = flags.pollInterval ?? 3;
  const pollPromises = taskIds.map((taskId) =>
    poll<DashScopeTaskResponse>(client, settings, {
      url: client.url(taskPath(taskId)),
      intervalSec: pollInterval,
      timeoutSec: settings.timeout,
      isComplete: (d) => (d as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
      isFailed: (d) => (d as DashScopeTaskResponse).output.task_status === "FAILED",
      getStatus: (d) => (d as DashScopeTaskResponse).output.task_status,
      getErrorMessage: (d) => {
        const o = (d as DashScopeTaskResponse).output;
        return o.message || o.code || undefined;
      },
    }),
  );

  const results = await Promise.all(pollPromises);

  let imageUrls: string[] = [];
  for (const result of results) {
    if (result.output.choices) {
      const urls = result.output.choices
        .flatMap((c) => c.message?.content || [])
        .map((item) => item.image)
        .filter(Boolean);
      imageUrls.push(...urls);
    }
    if (result.output.results) {
      const urls = result.output.results.map((r) => r.url).filter(Boolean);
      if (urls.length > 0 && imageUrls.length === 0) {
        imageUrls.push(...urls);
      }
    }
  }

  if (imageUrls.length === 0) {
    throw new BailianError("All tasks completed but no images returned.", ExitCode.GENERAL);
  }

  await saveImages(imageUrls, flags, settings, format);
}

async function saveImages(
  imageUrls: string[],
  flags: EditFlags,
  settings: Settings,
  format: OutputFormat,
): Promise<void> {
  const outDir = resolveOutputDir(settings, {
    flagDir: flags.outDir,
    subDir: flags.outDir ? undefined : "images",
  });

  const prefix = flags.outPrefix || generateFilename("edited", flags.prompt);

  // Parallel download all images
  const items =
    imageUrls.length > 1
      ? imageUrls.map((url, i) => {
          const filename = `${prefix}_${String(i + 1).padStart(3, "0")}.png`;
          return { url, destPath: join(outDir, filename) };
        })
      : [{ url: imageUrls[0], destPath: join(outDir, `${prefix}.png`) }];

  const saved = await downloadParallel(items, downloadFile, { quiet: settings.quiet });

  if (settings.quiet) {
    emitBare(saved.join("\n"));
  } else {
    emitResult({ urls: imageUrls, saved, total: imageUrls.length }, format);
  }
}
