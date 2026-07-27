import {
  defineCommand,
  imagePath,
  imageSyncPath,
  taskPath,
  detectOutputFormat,
  type Client,
  type Settings,
  type FlagsDef,
  type ParsedFlags,
  resolveOutputDir,
  type DashScopeImageRequest,
  type DashScopeImageSyncResponse,
  BailianError,
  ExitCode,
  type DashScopeAsyncResponse,
  type OutputFormat,
  type DashScopeTaskResponse,
  generateFilename,
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
import { BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

import { join } from "path";

// Qwen-Image 2.0 and Wan 2.7 use the sync multimodal-generation endpoint.
const SYNC_MODEL_PREFIXES = ["qwen-image-2.0", "qwen-image-max", "wan2.7-image"];
const PROMPT_EXTEND_DEFAULT_PREFIXES = ["qwen-image-2.0", "qwen-image-max"];

function isSyncModel(model: string): boolean {
  return SYNC_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));
}

function enablesPromptExtendByDefault(model: string): boolean {
  return PROMPT_EXTEND_DEFAULT_PREFIXES.some((prefix) => model.startsWith(prefix));
}

const GENERATE_FLAGS = {
  prompt: { type: "string", valueHint: "<text>", description: "Image description", required: true },
  model: {
    type: "string",
    valueHint: "<model>",
    description: "Model ID (default: qwen-image-2.0)",
  },
  size: {
    type: "string",
    valueHint: "<W*H|WxH>",
    description: "Image size: ratio (3:4, 16:9, 1:1) or pixels (2048*2048 or 1024x1024)",
  },
  n: {
    type: "number",
    valueHint: "<count>",
    description: "Number of images per request (default: 1, max: 6)",
  },
  seed: {
    type: "number",
    valueHint: "<n>",
    description: "Random seed for reproducible generation",
  },
  negativePrompt: {
    type: "string",
    valueHint: "<text>",
    description: "Negative prompt to exclude unwanted content",
  },
  promptExtend: {
    type: "boolean",
    valueHint: "<bool>",
    description: BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE,
  },
  watermark: {
    type: "boolean",
    valueHint: "<bool>",
    description: BOOL_FLAG_WATERMARK,
  },
  ...ASYNC_FLAG,
  ...CONCURRENT_FLAG,
  outDir: { type: "string", valueHint: "<dir>", description: "Download images to directory" },
  outPrefix: {
    type: "string",
    valueHint: "<prefix>",
    description: "Filename prefix (default: image)",
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: "Polling interval when waiting (default: 3)",
  },
} satisfies FlagsDef;
type GenerateFlags = ParsedFlags<typeof GENERATE_FLAGS>;

export default defineCommand({
  description: "Generate images (Qwen-Image / wan2.x)",
  auth: "apiKey",
  usageArgs: "--prompt <text> [flags]",
  flags: GENERATE_FLAGS,
  exampleArgs: [
    '--prompt "A cat in a spacesuit on Mars"',
    '--prompt "Logo design" --n 3 --out-dir ./generated/',
    '--prompt "Mountain landscape" --size 2688*1536',
    '--prompt "A castle" --seed 42 --prompt-extend false',
    '--prompt "Logo" --watermark false',
    '--prompt "An alien in the space" --watermark false',
    '--prompt "sunset" --model wan2.6-t2i --async --quiet',
    '--prompt "Pro quality" --model qwen-image-2.0-pro',
    '--prompt "Product shots" --n 2 --concurrent 3  # 6 images in parallel',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const prompt = flags.prompt;

    const model = flags.model || settings.defaultImageModel || "qwen-image-2.0";
    const useSync = isSyncModel(model);
    const defaultSize = useSync ? "1:1" : "1:1";
    const sizeInput = flags.size || defaultSize;
    const size = resolveImageSize(sizeInput, useSync);
    const n = flags.n ?? 1;
    const concurrent = getConcurrency(flags);

    const promptExtend = resolveBooleanFlag(
      flags.promptExtend,
      enablesPromptExtendByDefault(model) ? true : undefined,
      "prompt-extend",
    );

    const watermark = resolveWatermark(flags.watermark);

    const body: DashScopeImageRequest = {
      model,
      input: {
        messages: [{ role: "user", content: [{ text: prompt }] }],
      },
      parameters: {
        size,
        n,
        seed: flags.seed,
        prompt_extend: promptExtend,
        watermark,
        negative_prompt: flags.negativePrompt || undefined,
      },
    };

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ request: body, mode: useSync ? "sync" : "async" }, format);
      return;
    }

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: ${useSync ? "sync" : "async"}]\n`);
    }

    if (useSync) {
      await handleSyncMode(ctx.client, settings, model, body, flags, format, concurrent);
    } else {
      await handleAsyncMode(ctx.client, settings, model, body, flags, format, concurrent);
    }
  },
});

// ---- Sync mode: qwen-image-2.0 series ----

async function handleSyncMode(
  client: Client,
  settings: Settings,
  _model: string,
  body: DashScopeImageRequest,
  flags: GenerateFlags,
  format: string,
  concurrent: number,
): Promise<void> {
  const results = await runConcurrent(concurrent, settings, () =>
    client.requestJson<DashScopeImageSyncResponse>({ path: imageSyncPath(), method: "POST", body }),
  );

  const imageUrls = results
    .flatMap((r) => r.output.choices || [])
    .flatMap((c) => c.message?.content || [])
    .map((item) => item.image)
    .filter(Boolean);

  if (imageUrls.length === 0) {
    throw new BailianError("Generation completed but no images returned.", ExitCode.GENERAL);
  }

  await saveImages(imageUrls, flags, settings, format);
}

// ---- Async mode: wan2.x / qwen-image-plus ----

async function handleAsyncMode(
  client: Client,
  settings: Settings,
  _model: string,
  body: DashScopeImageRequest,
  flags: GenerateFlags,
  format: string,
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

  // --async: return all task IDs immediately
  if (flags.async) {
    emitResult({ task_ids: taskIds }, format as OutputFormat);
    return;
  }

  // Poll all tasks concurrently
  const pollInterval = flags.pollInterval ?? 3;

  const pollPromises = taskIds.map((taskId) => {
    const pollUrl = client.url(taskPath(taskId));
    return poll<DashScopeTaskResponse>(client, settings, {
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

  await saveImages(
    imageUrls,
    flags,
    settings,
    format,
    taskIds.length === 1 ? taskIds[0] : undefined,
    taskIds,
  );
}

// ---- Shared: download & save ----

async function saveImages(
  imageUrls: string[],
  flags: GenerateFlags,
  settings: Settings,
  format: string,
  taskId?: string,
  taskIds?: string[],
): Promise<void> {
  const outDir = resolveOutputDir(settings, {
    flagDir: flags.outDir,
    subDir: flags.outDir ? undefined : "images",
  });

  const promptText = flags.prompt || "";
  const prefix = flags.outPrefix || generateFilename("image", promptText);

  // Parallel download all images
  const items =
    imageUrls.length > 1
      ? imageUrls.map((url, i) => {
          const filename = `${prefix}_${String(i + 1).padStart(3, "0")}.png`;
          return { url, destPath: join(outDir, filename) };
        })
      : [{ url: imageUrls[0], destPath: join(outDir, `${prefix}.png`) }];

  const results = await downloadParallel(items, downloadFile, { quiet: settings.quiet });

  if (settings.quiet) {
    emitBare(results.join("\n"));
  } else {
    const output: Record<string, unknown> = {
      urls: imageUrls,
      saved: results,
      total: imageUrls.length,
    };
    if (taskId) output.task_id = taskId;
    if (taskIds && taskIds.length > 1) output.task_ids = taskIds;
    emitResult(output, format as OutputFormat);
  }
}
