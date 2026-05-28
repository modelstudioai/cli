import {
  defineCommand,
  requestJson,
  imageSyncEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  resolveCredential,
  resolveFileUrl,
  resolveOutputDir,
  generateFilename,
  isInteractive,
  stripUndefined,
  type DashScopeImageRequest,
  type DashScopeImageSyncResponse,
  ExitCode,
  BailianError,
} from "bailian-cli-core";
import { downloadFile } from "../../utils/download.ts";
import { runConcurrent, downloadParallel, getConcurrency } from "../../utils/concurrent.ts";
import { promptText, failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";
import { resolveImageSize } from "../../utils/image-size.ts";
import { join } from "path";

export default defineCommand({
  name: "image edit",
  description: "Edit an existing image with text instructions (Qwen-Image)",
  apiDocs: "/developer-reference/qwen-image-edit-api",
  usage: "bl image edit --image <url> --prompt <text> [flags]",
  options: [
    {
      flag: "--image <url>",
      description: "Source image URL or local file path (repeatable for multi-image merge)",
      required: true,
      type: "array",
    },
    { flag: "--prompt <text>", description: "Edit instruction text", required: true },
    { flag: "--model <model>", description: "Model ID (default: qwen-image-2.0)" },
    {
      flag: "--size <W*H>",
      description: "Output image size: ratio (3:4, 16:9) or pixels (2048*2048)",
    },
    { flag: "--n <count>", description: "Number of images (default: 1, max: 6)", type: "number" },
    { flag: "--seed <n>", description: "Random seed for reproducible results", type: "number" },
    {
      flag: "--negative-prompt <text>",
      description: "Negative prompt to exclude unwanted content",
    },
    { flag: "--prompt-extend", description: "Enable prompt smart rewrite (default: true)" },
    { flag: "--no-prompt-extend", description: "Disable prompt extend" },
    { flag: "--watermark", description: "Add watermark to output images" },
    { flag: "--out-dir <dir>", description: "Download images to directory" },
    { flag: "--out-prefix <prefix>", description: "Filename prefix (default: edited)" },
  ],
  examples: [
    'bl image edit --image ./photo.png --prompt "把背景换成海滩"',
    'bl image edit --image https://example.com/logo.png --prompt "Change color to blue" --n 3',
    'bl image edit --image ./a.png --image ./b.png --prompt "把两张图合并成一张拼图"',
    'bl image edit --image https://example.com/photo.png --prompt "Remove the person" --model qwen-image-2.0-pro',
  ],
  async run(config: Config, flags: GlobalFlags) {
    // Normalize --image to string array (supports both single and repeated flags)
    let rawImages: string[] = [];
    if (Array.isArray(flags.image)) {
      rawImages = flags.image as string[];
    } else if (typeof flags.image === "string") {
      rawImages = [flags.image];
    }
    if (rawImages.length === 0) {
      failIfMissing("image", "bl image edit --image <url> --prompt <text>");
    }

    let prompt = flags.prompt as string | undefined;
    if (!prompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({
          message: "Enter your edit instruction:",
        });
        if (!hint) {
          process.stderr.write("Image editing cancelled.\n");
          process.exit(1);
        }
        prompt = hint;
      } else {
        failIfMissing("prompt", "bl image edit --image <url> --prompt <text>");
      }
    }

    const model = (flags.model as string) || config.defaultImageModel || "qwen-image-2.0";

    // Auto-upload local files (resolve all images in parallel)
    const credential = await resolveCredential(config);
    const resolvedImages = await Promise.all(
      rawImages.map((img) => resolveFileUrl(img, credential.token, model)),
    );
    const n = (flags.n as number) ?? 1;

    // Determine prompt_extend
    let promptExtend: boolean | undefined;
    if (flags.noPromptExtend === true) {
      promptExtend = false;
    } else if (flags.promptExtend === true) {
      promptExtend = true;
    } else {
      promptExtend = true; // default on for qwen-image
    }

    // Build content: all images first, then text prompt
    const contentItems: Array<{ image?: string; text?: string }> = resolvedImages.map(
      (u: string) => ({ image: u }),
    );
    contentItems.push({ text: prompt! });

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
        size: resolveImageSize(flags.size as string | undefined, true),
        n,
        seed: flags.seed as number | undefined,
        prompt_extend: promptExtend,
        watermark: flags.watermark === true ? true : undefined,
        negative_prompt: (flags.negativePrompt as string) || undefined,
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
      flagDir: flags.outDir as string | undefined,
      subDir: flags.outDir ? undefined : "images",
    });

    const prefix =
      (flags.outPrefix as string) || generateFilename("edited", flags?.prompt as string);

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
