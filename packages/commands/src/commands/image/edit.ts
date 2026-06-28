import {
  defineCommand,
  requestJson,
  imageSyncEndpoint,
  detectOutputFormat,
  resolveCredential,
  resolveFileUrl,
  resolveOutputDir,
  generateFilename,
  stripUndefined,
  type DashScopeImageRequest,
  type DashScopeImageSyncResponse,
  ExitCode,
  BailianError,
  resolveBooleanFlag,
  resolveWatermark,
} from "bailian-cli-core";
import { downloadFile } from "bailian-cli-runtime";
import { runConcurrent, downloadParallel, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveImageSize } from "bailian-cli-runtime";
import { join } from "path";
import { BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";

export default defineCommand({
  description: "Edit an existing image with text instructions (Qwen-Image)",
  auth: "apiKey",
  usageArgs: "--image <url> --prompt <text> [flags]",
  flags: {
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
  },
  exampleArgs: [
    '--image ./photo.png --prompt "Replace the background with a beach"',
    '--image https://example.com/logo.png --prompt "Change color to blue" --n 3',
    '--image ./a.png --image ./b.png --prompt "Merge two images into one collage"',
    '--image https://example.com/photo.png --prompt "Remove the person" --model qwen-image-2.0-pro',
    '--image ./photo.png --prompt "Replace the background with a beach" --watermark false',
  ],
  async run(config, flags) {
    // Normalize --image to string array (supports both single and repeated flags)
    let rawImages: string[] = [];
    if (Array.isArray(flags.image)) {
      rawImages = flags.image;
    } else if (typeof flags.image === "string") {
      rawImages = [flags.image];
    }
    const prompt = flags.prompt;

    const model = flags.model || config.defaultImageModel || "qwen-image-2.0";

    // Auto-upload local files (resolve all images in parallel)
    const credential = await resolveCredential(config);
    const resolvedImages = await Promise.all(
      rawImages.map((img) => resolveFileUrl(img, credential.token, model)),
    );
    const n = flags.n ?? 1;

    const promptExtend = resolveBooleanFlag(flags.promptExtend, true, "prompt-extend");

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
        size: resolveImageSize(flags.size, true),
        n,
        seed: flags.seed,
        prompt_extend: promptExtend,
        watermark,
        negative_prompt: flags.negativePrompt || undefined,
      },
    };

    // Remove undefined parameters
    stripUndefined(body.parameters as Record<string, unknown>);

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    if (!config.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: sync] [Images: ${resolvedImages.length}]\n`);
    }

    const url = imageSyncEndpoint(config.baseUrl);
    const concurrent = getConcurrency(flags);

    const results = await runConcurrent(concurrent, config, () =>
      requestJson<DashScopeImageSyncResponse>(config, {
        url,
        method: "POST",
        body,
      }),
    );

    // Extract image URLs from all responses
    const imageUrls = results
      .flatMap((r) => r.output.choices || [])
      .flatMap((c) => c.message?.content || [])
      .map((item) => item.image)
      .filter(Boolean);

    if (imageUrls.length === 0) {
      throw new BailianError("Edit completed but no images returned.", ExitCode.GENERAL);
    }

    const outDir = resolveOutputDir(config, {
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

    const saved = await downloadParallel(items, downloadFile, { quiet: config.quiet });

    if (config.quiet) {
      emitBare(saved.join("\n"));
    } else {
      emitResult({ urls: imageUrls, saved, total: imageUrls.length }, format);
    }
  },
});
