import {
  defineCommand,
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
  resolveImageGenerateApi,
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

const GENERATE_FLAGS = {
  prompt: { type: "string", valueHint: "<text>", description: "Image description", required: true },
  model: {
    type: "string",
    valueHint: "<model>",
    description: "Model ID (default: qwen-image-2.0)",
  },
  size: {
    type: "string",
    valueHint: "<W*H>",
    description: "Image size: ratio (3:4, 16:9, 1:1) or pixels (2048*2048)",
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
    '--prompt "plush doll" --model z-image-turbo --size 1024*1024',
    '--prompt "sunset" --model wanx2.0-t2i-turbo --size 1024*1024',
    '--prompt "Pro quality" --model qwen-image-2.0-pro',
    '--prompt "Product shots" --n 2 --concurrent 3  # 6 images in parallel',
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const prompt = flags.prompt;

    const model = flags.model || settings.defaultImageModel || "qwen-image-2.0";
    const route = resolveImageGenerateApi(model);
    const defaultSize = "1:1";
    const sizeInput = flags.size || defaultSize;
    const size = resolveImageSize(sizeInput, route.sizeProfile);
    const n = flags.n ?? 1;
    const concurrent = getConcurrency(flags);

    const promptExtend = resolveBooleanFlag(
      flags.promptExtend,
      route.promptExtendDefault,
      "prompt-extend",
    );

    const watermark = resolveWatermark(flags.watermark);

    const parameters: NonNullable<DashScopeImageRequest["parameters"]> = {
      size,
      n,
      seed: flags.seed,
      prompt_extend: promptExtend,
      watermark,
    };

    const body: DashScopeImageRequest =
      route.inputStyle === "prompt"
        ? {
            model,
            input: {
              prompt,
              negative_prompt: flags.negativePrompt || undefined,
            },
            parameters,
          }
        : {
            model,
            input: {
              messages: [{ role: "user", content: [{ text: prompt }] }],
            },
            parameters: {
              ...parameters,
              negative_prompt: flags.negativePrompt || undefined,
            },
          };

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        { request: body, mode: route.useSync ? "sync" : "async", path: route.path },
        format,
      );
      return;
    }

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: ${route.useSync ? "sync" : "async"}]\n`);
    }

    if (route.useSync) {
      await handleSyncMode(ctx.client, settings, route.path, body, flags, format, concurrent);
    } else {
      await handleAsyncMode(ctx.client, settings, route.path, body, flags, format, concurrent);
    }
  },
});

// ---- Sync mode: qwen-image / wan2.7-image / z-image ----

async function handleSyncMode(
  client: Client,
  settings: Settings,
  path: string,
  body: DashScopeImageRequest,
  flags: GenerateFlags,
  format: string,
  concurrent: number,
): Promise<void> {
  const results = await runConcurrent(concurrent, settings, () =>
    client.requestJson<DashScopeImageSyncResponse>({ path, method: "POST", body }),
  );

  const imageUrls = results
    .flatMap((result) => result.output.choices || [])
    .flatMap((choice) => choice.message?.content || [])
    .map((item) => item.image)
    .filter(Boolean);

  if (imageUrls.length === 0) {
    throw new BailianError("Generation completed but no images returned.", ExitCode.GENERAL);
  }

  await saveImages(imageUrls, flags, settings, format);
}

// ---- Async mode: wan2.6-t2i / wan2.6-image / legacy text2image ----

async function handleAsyncMode(
  client: Client,
  settings: Settings,
  path: string,
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
        path,
        method: "POST",
        body,
        async: true,
      }),
    "tasks",
  );
  const taskIds = responses.map((response) => response.output.task_id);

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
      isComplete: (data) => (data as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
      isFailed: (data) => (data as DashScopeTaskResponse).output.task_status === "FAILED",
      getStatus: (data) => (data as DashScopeTaskResponse).output.task_status,
      getErrorMessage: (data) => {
        const output = (data as DashScopeTaskResponse).output;
        return output.message || output.code || undefined;
      },
    });
  });

  const results = await Promise.all(pollPromises);

  let imageUrls: string[] = [];
  for (const result of results) {
    if (result.output.choices) {
      const urls = result.output.choices
        .flatMap((choice) => choice.message?.content || [])
        .map((item) => item.image)
        .filter(Boolean);
      imageUrls.push(...urls);
    }
    if (result.output.results) {
      const urls = result.output.results.map((item) => item.url).filter(Boolean);
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
      ? imageUrls.map((url, index) => {
          const filename = `${prefix}_${String(index + 1).padStart(3, "0")}.png`;
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
