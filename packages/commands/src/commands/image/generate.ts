import {
  defineCommand,
  taskPath,
  type CommandOutput,
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
  type DashScopeTaskResponse,
  generateFilename,
  resolveBooleanFlag,
  resolveWatermark,
  resolveImageGenerateApi,
  ASYNC_FLAG,
  CONCURRENT_FLAG,
  bailianMcpPath,
  AIGC_MCP_SERVER,
  AIGC_MCP_TOOL,
  buildImageGenArgs,
  parseAigcImageResults,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { downloadFile } from "bailian-cli-runtime";
import { runConcurrent, downloadParallel, getConcurrency } from "bailian-cli-runtime";
import { resolveImageSize } from "bailian-cli-runtime";
import { BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";
import {
  isAutoModel,
  assertAutoMcpAvailable,
  assertMcpCompatible,
  resolveAutoImageSize,
  withAigcMcpSession,
  type Localize,
} from "../shared/aigc-mcp.ts";

import { join } from "path";

const GENERATE_FLAGS = {
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Image description", "zh-CN": "图片描述" },
    required: true,
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Model ID (default: qwen-image-3.0)",
      "zh-CN": "模型 ID（默认：qwen-image-3.0）",
    },
  },
  size: {
    type: "string",
    valueHint: "<W*H>",
    description: {
      "en-US": "Image size: ratio (3:4, 16:9, 1:1) or pixels (2048*2048)",
      "zh-CN": "图片尺寸：比例（3:4、16:9、1:1）或像素（2048*2048）",
    },
  },
  n: {
    type: "number",
    valueHint: "<count>",
    description: {
      "en-US": "Number of images per request (default: 1, max: 6)",
      "zh-CN": "每次请求生成的图片数量（默认：1，最多：6）",
    },
  },
  seed: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Random seed for reproducible generation",
      "zh-CN": "用于复现生成结果的随机种子",
    },
  },
  negativePrompt: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Negative prompt to exclude unwanted content",
      "zh-CN": "负向提示词，用于排除不需要的内容",
    },
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
  outDir: {
    type: "string",
    valueHint: "<dir>",
    description: { "en-US": "Download images to directory", "zh-CN": "将图片下载到指定目录" },
  },
  outPrefix: {
    type: "string",
    valueHint: "<prefix>",
    description: {
      "en-US": "Filename prefix (default: image)",
      "zh-CN": "文件名前缀（默认：image）",
    },
  },
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval when waiting (default: 3)",
      "zh-CN": "等待任务时的轮询间隔（默认：3 秒）",
    },
  },
} satisfies FlagsDef;
type GenerateFlags = ParsedFlags<typeof GENERATE_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Generate images (Qwen-Image / wan2.x)",
    "zh-CN": "生成图片（Qwen-Image / wan2.x）",
  },
  auth: "apiKey",
  usageArgs: "--prompt <text> [flags]",
  flags: GENERATE_FLAGS,
  exampleArgs: [
    {
      "en-US": '--prompt "A cat in a spacesuit on Mars"',
      "zh-CN": '--prompt "一只穿着宇航服的猫站在火星上"',
    },
    {
      "en-US": '--prompt "Logo design" --n 3 --out-dir ./generated/',
      "zh-CN": '--prompt "Logo 设计" --n 3 --out-dir ./generated/',
    },
    {
      "en-US": '--prompt "Mountain landscape" --size 2688*1536',
      "zh-CN": '--prompt "山地景观" --size 2688*1536',
    },
    {
      "en-US": '--prompt "A castle" --seed 42 --prompt-extend false',
      "zh-CN": '--prompt "一座城堡" --seed 42 --prompt-extend false',
    },
    {
      "en-US": '--prompt "Logo" --watermark false',
      "zh-CN": '--prompt "Logo" --watermark false',
    },
    {
      "en-US": '--prompt "An alien in the space" --watermark false',
      "zh-CN": '--prompt "太空中的外星人" --watermark false',
    },
    {
      "en-US": '--prompt "sunset" --model wan2.6-t2i --async --quiet',
      "zh-CN": '--prompt "日落" --model wan2.6-t2i --async --quiet',
    },
    {
      "en-US": '--prompt "plush doll" --model z-image-turbo --size 1024*1024',
      "zh-CN": '--prompt "毛绒玩偶" --model z-image-turbo --size 1024*1024',
    },
    {
      "en-US": '--prompt "sunset" --model wanx2.0-t2i-turbo --size 1024*1024',
      "zh-CN": '--prompt "日落" --model wanx2.0-t2i-turbo --size 1024*1024',
    },
    {
      "en-US": '--prompt "Pro quality" --model qwen-image-2.0-pro',
      "zh-CN": '--prompt "专业品质" --model qwen-image-2.0-pro',
    },
    {
      "en-US": '--prompt "Product shots" --n 2 --concurrent 3  # 6 images in parallel',
      "zh-CN": '--prompt "产品摄影" --n 2 --concurrent 3  # 并行生成 6 张图片',
    },
  ],
  notes: [
    {
      "en-US":
        'Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set; MCP-incompatible flags fail fast with a usage error instead of falling back to REST.',
      "zh-CN":
        '模型 "auto"（通过 --model auto 或将配置默认模型设为 "auto"）改走百炼官方 MCP，参数面更小；MCP 不支持的参数会直接报用法错误，而不回退 REST。',
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const prompt = flags.prompt;

    const resolvedModel = flags.model || settings.defaultImageModel;
    if (isAutoModel(resolvedModel)) {
      await handleAutoMcpMode(ctx.client, ctx.output, ctx.localize, settings, flags);
      return;
    }

    const model = resolvedModel || "qwen-image-3.0";
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

    const watermark = resolveWatermark(flags.watermark, settings.watermark);

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

    if (settings.dryRun) {
      ctx.output.result({
        request: body,
        mode: route.useSync ? "sync" : "async",
        path: route.path,
      });
      return;
    }

    ctx.output.info({
      "en-US": `[Model: ${model}] [Mode: ${route.useSync ? "sync" : "async"}]`,
      "zh-CN": `[模型：${model}] [模式：${route.useSync ? "同步" : "异步"}]`,
    });

    if (route.useSync) {
      await handleSyncMode(ctx.client, ctx.output, settings, route.path, body, flags, concurrent);
    } else {
      await handleAsyncMode(ctx.client, ctx.output, settings, route.path, body, flags, concurrent);
    }
  },
});

// ---- Auto mode: Bailian AIGC MCP (bailian_image_gen) ----

async function handleAutoMcpMode(
  client: Client,
  commandOutput: CommandOutput,
  localize: Localize,
  settings: Settings,
  flags: GenerateFlags,
): Promise<void> {
  assertAutoMcpAvailable(client, localize);
  assertMcpCompatible("imageGen", flags, localize);

  const concurrent = getConcurrency(flags);
  const args = buildImageGenArgs({
    prompt: flags.prompt,
    size: resolveAutoImageSize(flags.size, localize),
    n: flags.n,
    negativePrompt: flags.negativePrompt || undefined,
    promptExtend: flags.promptExtend,
  });

  if (settings.dryRun) {
    commandOutput.result({
      server: AIGC_MCP_SERVER.image,
      url: client.url(bailianMcpPath(AIGC_MCP_SERVER.image)),
      tool: AIGC_MCP_TOOL.imageGen,
      arguments: args,
      mode: "mcp",
      concurrent,
    });
    return;
  }

  commandOutput.info({ "en-US": "[Model: auto] [Mode: mcp]", "zh-CN": "[模型：auto] [模式：mcp]" });

  // One shared MCP session; --concurrent fans out parallel tools/call on it.
  await withAigcMcpSession(client, AIGC_MCP_SERVER.image, localize, async (callTool) => {
    const perRequest = await runConcurrent(concurrent, commandOutput, async () => {
      const inner = await callTool(AIGC_MCP_TOOL.imageGen, args);
      return parseAigcImageResults(inner);
    });

    const imageUrls = perRequest.flat();
    if (imageUrls.length === 0) {
      throw new BailianError("Generation completed but no images returned.", ExitCode.GENERAL);
    }

    await saveImages(imageUrls, flags, settings, commandOutput);
  });
}

// ---- Sync mode: qwen-image / wan2.7-image / z-image ----

async function handleSyncMode(
  client: Client,
  commandOutput: CommandOutput,
  settings: Settings,
  path: string,
  body: DashScopeImageRequest,
  flags: GenerateFlags,
  concurrent: number,
): Promise<void> {
  const results = await runConcurrent(concurrent, commandOutput, () =>
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

  await saveImages(imageUrls, flags, settings, commandOutput);
}

// ---- Async mode: wan2.6-t2i / wan2.6-image / legacy text2image ----

async function handleAsyncMode(
  client: Client,
  commandOutput: CommandOutput,
  settings: Settings,
  path: string,
  body: DashScopeImageRequest,
  flags: GenerateFlags,
  concurrent: number,
): Promise<void> {
  const responses = await runConcurrent(
    concurrent,
    commandOutput,
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
    commandOutput.result({ task_ids: taskIds });
    return;
  }

  // Poll all tasks concurrently
  const pollInterval = flags.pollInterval ?? 3;

  const pollPromises = taskIds.map((taskId) => {
    const pollUrl = client.url(taskPath(taskId));
    return poll<DashScopeTaskResponse>(client, {
      output: commandOutput,
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
    commandOutput,
    taskIds.length === 1 ? taskIds[0] : undefined,
    taskIds,
  );
}

// ---- Shared: download & save ----

async function saveImages(
  imageUrls: string[],
  flags: GenerateFlags,
  settings: Settings,
  commandOutput: CommandOutput,
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

  const results = await downloadParallel(items, downloadFile, {
    quiet: settings.quiet || settings.output === "json",
  });

  const output: Record<string, unknown> = {
    urls: imageUrls,
    saved: results,
    total: imageUrls.length,
  };
  if (taskId) output.task_id = taskId;
  if (taskIds && taskIds.length > 1) output.task_ids = taskIds;
  commandOutput.result(output);
}
