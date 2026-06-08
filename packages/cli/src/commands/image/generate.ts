import {
  defineCommand,
  requestJson,
  imageEndpoint,
  imageSyncEndpoint,
  taskEndpoint,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  resolveOutputDir,
  isInteractive,
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
} from "bailian-cli-core";
import { poll } from "../../utils/polling.ts";
import { downloadFile } from "../../utils/download.ts";
import { runConcurrent, downloadParallel, getConcurrency } from "../../utils/concurrent.ts";
import { promptText, failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";
import { resolveImageSize } from "../../utils/image-size.ts";
import {
  BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE,
  BOOL_FLAG_WATERMARK,
} from "../../utils/flag-descriptions.ts";

import { join } from "path";

// qwen-image-2.0 series uses the sync multimodal-generation endpoint
const SYNC_MODEL_PREFIXES = ["qwen-image-2.0", "qwen-image-max"];

function isSyncModel(model: string): boolean {
  return SYNC_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

export default defineCommand({
  name: "image generate",
  description: "Generate images (Qwen-Image / wan2.x)",
  apiDocs: "/best-practice/wanx/text-to-image",
  usage: "bl image generate --prompt <text> [flags]",
  options: [
    { flag: "--prompt <text>", description: "Image description", required: true },
    { flag: "--model <model>", description: "Model ID (default: qwen-image-2.0)" },
    {
      flag: "--size <W*H>",
      description: "Image size: ratio (3:4, 16:9, 1:1) or pixels (2048*2048)",
    },
    {
      flag: "--n <count>",
      description: "Number of images per request (default: 1, max: 6)",
      type: "number",
    },
    { flag: "--seed <n>", description: "Random seed for reproducible generation", type: "number" },
    {
      flag: "--negative-prompt <text>",
      description: "Negative prompt to exclude unwanted content",
    },
    {
      flag: "--prompt-extend <bool>",
      description: BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE,
    },
    {
      flag: "--watermark <bool>",
      description: BOOL_FLAG_WATERMARK,
    },
    {
      flag: "--no-wait",
      description: "Return task ID immediately without waiting (async models only)",
    },
    { flag: "--out-dir <dir>", description: "Download images to directory" },
    { flag: "--out-prefix <prefix>", description: "Filename prefix (default: image)" },
    {
      flag: "--poll-interval <seconds>",
      description: "Polling interval when waiting (default: 3)",
      type: "number",
    },
  ],
  examples: [
    'bl image generate --prompt "一只穿太空服的猫在火星上"',
    'bl image generate --prompt "Logo design" --n 3 --out-dir ./generated/',
    'bl image generate --prompt "Mountain landscape" --size 2688*1536',
    'bl image generate --prompt "A castle" --seed 42 --prompt-extend false',
    'bl image generate --prompt "Logo" --watermark false',
    'bl image generate --prompt "An alien in the space" --watermark false',
    'bl image generate --prompt "sunset" --model wan2.6-t2i --no-wait --quiet',
    'bl image generate --prompt "Pro quality" --model qwen-image-2.0-pro',
    'bl image generate --prompt "Product shots" --n 2 --concurrent 3  # 6 images in parallel',
  ],
  async run(config: Config, flags: GlobalFlags) {
    let prompt = (flags.prompt ?? (flags._positional as string[] | undefined)?.[0]) as
      | string
      | undefined;

    if (!prompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({
          message: "Enter your image prompt:",
        });
        if (!hint) {
          process.stderr.write("Image generation cancelled.\n");
          process.exit(1);
        }
        prompt = hint;
      } else {
        failIfMissing("prompt", "bl image generate --prompt <text>");
      }
    }

    const model = (flags.model as string) || config.defaultImageModel || "qwen-image-2.0";
    const useSync = isSyncModel(model);
    const defaultSize = useSync ? "1:1" : "1:1";
    const sizeInput = (flags.size as string) || defaultSize;
    const size = resolveImageSize(sizeInput, useSync);
    const n = (flags.n as number) ?? 1;
    const concurrent = getConcurrency(flags);

    const promptExtend = resolveBooleanFlag(
      flags.promptExtend,
      useSync ? true : undefined,
      "prompt-extend",
    );

    const watermark = resolveWatermark(flags.watermark);

    const body: DashScopeImageRequest = {
      model,
      input: {
        messages: [{ role: "user", content: [{ text: prompt! }] }],
      },
      parameters: {
        size,
        n,
        seed: flags.seed as number | undefined,
        prompt_extend: promptExtend,
        watermark,
        negative_prompt: (flags.negativePrompt as string) || undefined,
      },
    };

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ request: body, mode: useSync ? "sync" : "async" }, format);
      return;
    }

    if (!config.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: ${useSync ? "sync" : "async"}]\n`);
    }

    if (useSync) {
      await handleSyncMode(config, model, body, flags, format, concurrent);
    } else {
      await handleAsyncMode(config, model, body, flags, format, concurrent);
    }
  },
});

// ---- Sync mode: qwen-image-2.0 series ----

async function handleSyncMode(
  config: Config,
  _model: string,
  body: DashScopeImageRequest,
  flags: GlobalFlags,
  format: string,
  concurrent: number,
): Promise<void> {
  const url = imageSyncEndpoint(config);

  const results = await runConcurrent(concurrent, config, () =>
    requestJson<DashScopeImageSyncResponse>(config, { url, method: "POST", body }),
  );

  const imageUrls = results
    .flatMap((r) => r.output.choices || [])
    .flatMap((c) => c.message?.content || [])
    .map((item) => item.image)
    .filter(Boolean);

  if (imageUrls.length === 0) {
    throw new BailianError("Generation completed but no images returned.", ExitCode.GENERAL);
  }

  await saveImages(imageUrls, flags, config, format);
}

// ---- Async mode: wan2.x / qwen-image-plus ----

async function handleAsyncMode(
  config: Config,
  _model: string,
  body: DashScopeImageRequest,
  flags: GlobalFlags,
  format: string,
  concurrent: number,
): Promise<void> {
  const url = imageEndpoint(config);

  const responses = await runConcurrent(
    concurrent,
    config,
    () => requestJson<DashScopeAsyncResponse>(config, { url, method: "POST", body, async: true }),
    "tasks",
  );
  const taskIds = responses.map((r) => r.output.task_id);

  // --no-wait: return all task IDs immediately
  if (flags.noWait || config.async) {
    emitResult({ task_ids: taskIds }, format as OutputFormat);
    return;
  }

  // Poll all tasks concurrently
  const pollInterval = (flags.pollInterval as number) ?? 3;

  const pollPromises = taskIds.map((taskId) => {
    const pollUrl = taskEndpoint(config, taskId);
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
    config,
    format,
    taskIds.length === 1 ? taskIds[0] : undefined,
    taskIds,
  );
}

// ---- Shared: download & save ----

async function saveImages(
  imageUrls: string[],
  flags: GlobalFlags,
  config: Config,
  format: string,
  taskId?: string,
  taskIds?: string[],
): Promise<void> {
  const outDir = resolveOutputDir(config, {
    flagDir: flags.outDir as string | undefined,
    subDir: flags.outDir ? undefined : "images",
  });

  const promptText =
    (flags.prompt as string) || (flags._positional as string[] | undefined)?.[0] || "";
  const prefix = (flags.outPrefix as string) || generateFilename("image", promptText);

  // Parallel download all images
  const items =
    imageUrls.length > 1
      ? imageUrls.map((url, i) => {
          const filename = `${prefix}_${String(i + 1).padStart(3, "0")}.png`;
          return { url, destPath: join(outDir, filename) };
        })
      : [{ url: imageUrls[0], destPath: join(outDir, `${prefix}.png`) }];

  const results = await downloadParallel(items, downloadFile, { quiet: config.quiet });

  if (config.quiet) {
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
