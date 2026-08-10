import {
  defineCommand,
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
  resolveImageEditApi,
  ASYNC_FLAG,
  CONCURRENT_FLAG,
  redactDataUri,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile } from "bailian-cli-runtime";
import { runConcurrent, downloadParallel, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveImageSize } from "bailian-cli-runtime";
import { join } from "path";
import { BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

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
    description: "Model ID (default: qwen-image-3.0)",
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
  function: {
    type: "string",
    valueHint: "<name>",
    description:
      "wanx*-imageedit function (default: description_edit). Examples: stylization_all, description_edit",
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
  description: "Edit an existing image with text instructions (Qwen-Image / Wan 2.7)",
  auth: "apiKey",
  usageArgs: "--image <url> --prompt <text> [flags]",
  flags: EDIT_FLAGS,
  exampleArgs: [
    '--image ./photo.png --prompt "Replace the background with a beach"',
    '--image https://example.com/logo.png --prompt "Change color to blue" --n 3',
    '--image ./a.png --image ./b.png --prompt "Merge two images into one collage"',
    '--image https://example.com/photo.png --prompt "Remove the person" --model qwen-image-2.0-pro',
    '--image ./photo.png --prompt "Change the style" --model wan2.7-image',
    '--image ./photo.png --prompt "Place the subject on a table" --model wan2.5-i2i-preview',
    '--image ./photo.png --prompt "转换成绘本风格" --model wanx2.1-imageedit --function stylization_all',
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

    const model = flags.model || settings.defaultImageModel || "qwen-image-3.0";
    const route = resolveImageEditApi(model);

    // Auto-upload local files (resolve all images in parallel)
    const resolvedImages = await Promise.all(
      rawImages.map((image) => ctx.client.resolveImageInput(image, model)),
    );
    const n = flags.n ?? 1;

    const promptExtend = resolveBooleanFlag(
      flags.promptExtend,
      route.promptExtendDefault,
      "prompt-extend",
    );

    const watermark = resolveWatermark(flags.watermark);

    const parameters: NonNullable<DashScopeImageRequest["parameters"]> = {
      size: resolveImageSize(flags.size, route.sizeProfile),
      n,
      seed: flags.seed,
      prompt_extend: promptExtend,
      watermark,
    };

    let body: DashScopeImageRequest;
    if (route.inputStyle === "function-base-image") {
      const baseImageUrl = resolvedImages[0];
      if (!baseImageUrl) {
        throw new BailianError(
          "wanx*-imageedit requires at least one --image as base_image_url.",
          ExitCode.USAGE,
        );
      }
      body = {
        model,
        input: {
          function: flags.function || "description_edit",
          prompt,
          base_image_url: baseImageUrl,
        },
        parameters,
      };
    } else if (route.inputStyle === "prompt-images") {
      body = {
        model,
        input: {
          prompt,
          images: resolvedImages,
          negative_prompt: flags.negativePrompt || undefined,
        },
        parameters,
      };
    } else {
      const contentItems: Array<{ image?: string; text?: string }> = resolvedImages.map(
        (imageUrl: string) => ({ image: imageUrl }),
      );
      contentItems.push({ text: prompt });
      body = {
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
          ...parameters,
          negative_prompt: flags.negativePrompt || undefined,
        },
      };
    }

    // Remove undefined parameters
    stripUndefined(body.parameters as Record<string, unknown>);

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      let previewBody: DashScopeImageRequest = body;
      if ("messages" in body.input) {
        previewBody = {
          ...body,
          input: {
            messages: body.input.messages.map((message) => ({
              ...message,
              content: message.content.map((item) =>
                item.image ? { ...item, image: redactDataUri(item.image) } : item,
              ),
            })),
          },
        };
      } else if ("images" in body.input) {
        previewBody = {
          ...body,
          input: {
            ...body.input,
            images: body.input.images?.map((imageUrl) => redactDataUri(imageUrl)),
          },
        };
      } else if ("base_image_url" in body.input) {
        previewBody = {
          ...body,
          input: {
            ...body.input,
            base_image_url: redactDataUri(body.input.base_image_url),
            mask_image_url: body.input.mask_image_url
              ? redactDataUri(body.input.mask_image_url)
              : undefined,
          },
        };
      }
      emitResult(
        { request: previewBody, mode: route.useSync ? "sync" : "async", path: route.path },
        format,
      );
      return;
    }

    if (!settings.quiet) {
      process.stderr.write(
        `[Model: ${model}] [Mode: ${route.useSync ? "sync" : "async"}] [Images: ${resolvedImages.length}]\n`,
      );
    }

    const concurrent = getConcurrency(flags);

    if (route.useSync) {
      await handleSyncMode(ctx.client, settings, route.path, body, flags, format, concurrent);
    } else {
      await handleAsyncMode(ctx.client, settings, route.path, body, flags, format, concurrent);
    }
  },
});

async function handleSyncMode(
  client: Client,
  settings: Settings,
  path: string,
  body: DashScopeImageRequest,
  flags: EditFlags,
  format: OutputFormat,
  concurrent: number,
): Promise<void> {
  const results = await runConcurrent(concurrent, settings, () =>
    client.requestJson<DashScopeImageSyncResponse>({
      path,
      method: "POST",
      body,
    }),
  );

  const imageUrls = results
    .flatMap((result) => result.output.choices || [])
    .flatMap((choice) => choice.message?.content || [])
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
  path: string,
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
        path,
        method: "POST",
        body,
        async: true,
      }),
    "tasks",
  );
  const taskIds = responses.map((response) => response.output.task_id);

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
      isComplete: (data) => (data as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
      isFailed: (data) => (data as DashScopeTaskResponse).output.task_status === "FAILED",
      getStatus: (data) => (data as DashScopeTaskResponse).output.task_status,
      getErrorMessage: (data) => {
        const output = (data as DashScopeTaskResponse).output;
        return output.message || output.code || undefined;
      },
    }),
  );

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
      ? imageUrls.map((url, index) => {
          const filename = `${prefix}_${String(index + 1).padStart(3, "0")}.png`;
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
