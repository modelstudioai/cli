import {
  defineCommand,
  image2ImagePath,
  ASYNC_FLAG,
  BailianError,
  ExitCode,
  resolveOutputDir,
  stripUndefined,
  type DashScopeAsyncResponse,
  type FlagsDef,
  type ImageTranslationRequest,
  type LocalizedText,
} from "bailian-cli-core";
import { downloadFile } from "bailian-cli-runtime";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { pollDashScopeTask } from "../shared/dashscope-task.ts";
import { hasNonAscii, isHttpUrl, parseTermPairs } from "../shared/translation.ts";

const DEFAULT_MODEL = "qwen-mt-image";
const SUPPORTED_MODELS = new Set(["qwen-mt-image", "qwen-mt-image-2.0"]);

const TRANSLATE_FLAGS = {
  image: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Image URL or local file",
      "zh-CN": "图片 URL 或本地文件",
    },
    required: true,
  },
  sourceLang: {
    type: "string",
    valueHint: "<lang>",
    description: {
      "en-US": "Source language name or code (default: auto)",
      "zh-CN": "源语言名称或编码（默认：auto）",
    },
  },
  targetLang: {
    type: "string",
    valueHint: "<lang>",
    description: {
      "en-US": "Target language name or code",
      "zh-CN": "目标语言名称或编码",
    },
    required: true,
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": "Model ID (default: qwen-mt-image; optional: qwen-mt-image-2.0)",
      "zh-CN": "模型 ID（默认：qwen-mt-image；可选：qwen-mt-image-2.0）",
    },
  },
  domainHint: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "English domain hint (maps to ext.domainHint)",
      "zh-CN": "英文领域提示（映射为 ext.domainHint）",
    },
  },
  term: {
    type: "array",
    valueHint: "<source=target>",
    description: {
      "en-US": "Terminology pair source=target (repeatable; maps to terminologies)",
      "zh-CN": "术语对 source=target（可重复；映射为 terminologies）",
    },
  },
  imageSegment: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Skip translating text on image subjects (ext.config.imageSegment)",
      "zh-CN": "跳过图片主体上的文字翻译（ext.config.imageSegment）",
    },
  },
  outDir: {
    type: "string",
    valueHint: "<path>",
    description: { "en-US": "Download directory", "zh-CN": "下载目录" },
  },
  ...ASYNC_FLAG,
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval when waiting (default: 5)",
      "zh-CN": "等待任务时的轮询间隔（默认：5 秒）",
    },
  },
} satisfies FlagsDef;

function isChineseOrEnglish(lang: string): boolean {
  const normalized = lang.trim().toLowerCase();
  return (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-tw" ||
    normalized === "chinese" ||
    normalized === "en" ||
    normalized === "en-us" ||
    normalized === "en-gb" ||
    normalized === "english"
  );
}

function assertImageInput(image: string, localize: (text: LocalizedText) => string): void {
  if (!image) {
    throw new BailianError(
      localize({
        "en-US": "--image must not be empty.",
        "zh-CN": "--image 不能为空。",
      }),
      ExitCode.USAGE,
    );
  }
  if (isHttpUrl(image)) {
    if (hasNonAscii(image)) {
      throw new BailianError(
        localize({
          "en-US": "Image URL must not contain non-ASCII characters.",
          "zh-CN": "图片 URL 不能包含非 ASCII 字符。",
        }),
        ExitCode.USAGE,
      );
    }
    return;
  }
  if (!existsSync(image)) {
    throw new BailianError(
      localize({
        "en-US": `Image file not found: ${image}`,
        "zh-CN": `图片文件不存在：${image}`,
      }),
      ExitCode.USAGE,
    );
  }
  if (!statSync(image).isFile()) {
    throw new BailianError(
      localize({
        "en-US": `Not a file: ${image}`,
        "zh-CN": `不是文件：${image}`,
      }),
      ExitCode.USAGE,
    );
  }
}

function assertLanguagePair(
  model: string,
  sourceLang: string,
  targetLang: string,
  localize: (text: LocalizedText) => string,
): void {
  if (!targetLang) {
    throw new BailianError(
      localize({
        "en-US": "--target-lang must not be empty.",
        "zh-CN": "--target-lang 不能为空。",
      }),
      ExitCode.USAGE,
    );
  }
  if (targetLang.toLowerCase() === "auto") {
    throw new BailianError(
      localize({
        "en-US": "--target-lang cannot be auto.",
        "zh-CN": "--target-lang 不能为 auto。",
      }),
      ExitCode.USAGE,
    );
  }
  if (sourceLang.toLowerCase() === targetLang.toLowerCase()) {
    throw new BailianError(
      localize({
        "en-US": "--source-lang and --target-lang must differ.",
        "zh-CN": "--source-lang 与 --target-lang 不能相同。",
      }),
      ExitCode.USAGE,
    );
  }
  // Legacy model requires Chinese or English on at least one side; auto is allowed.
  if (model === "qwen-mt-image" && sourceLang.toLowerCase() !== "auto") {
    if (!isChineseOrEnglish(sourceLang) && !isChineseOrEnglish(targetLang)) {
      throw new BailianError(
        localize({
          "en-US":
            "qwen-mt-image requires Chinese or English on at least one side of the language pair.",
          "zh-CN": "qwen-mt-image 要求源/目标语言至少一侧为中文或英文。",
        }),
        ExitCode.USAGE,
      );
    }
  }
}

export default defineCommand({
  description: {
    "en-US": "Translate text in an image (Qwen-MT-Image)",
    "zh-CN": "翻译图片中的文字（Qwen-MT-Image）",
  },
  auth: "apiKey",
  usageArgs: "--image <url-or-path> --target-lang <lang> [flags]",
  flags: TRANSLATE_FLAGS,
  exampleArgs: [
    {
      "en-US": "--image ./poster.png --target-lang en --dry-run --output json",
      "zh-CN": "--image ./poster.png --target-lang en --dry-run --output json",
    },
    {
      "en-US":
        "--image https://example.com/poster.png --source-lang zh --target-lang en --async --output json",
      "zh-CN":
        "--image https://example.com/poster.png --source-lang zh --target-lang en --async --output json",
    },
    {
      "en-US":
        '--image https://example.com/poster.png --target-lang en --term "百炼=Bailian" --domain-hint "ecommerce"',
      "zh-CN":
        '--image https://example.com/poster.png --target-lang en --term "百炼=Bailian" --domain-hint "ecommerce"',
    },
  ],
  notes: [
    {
      "en-US":
        "Always submits asynchronously. Use --async to return the task ID immediately, or wait and download the translated JPG. Query with `video task get --task-id`. Local files upload to temporary OSS (requires OssResourceResolve).",
      "zh-CN":
        "始终异步提交。使用 --async 立即返回任务 ID，或等待完成后下载译后 JPG。可用 `video task get --task-id` 查询。本地文件会上传临时 OSS（需 OssResourceResolve）。",
    },
  ],
  validate: (flags) => {
    if (
      flags.pollInterval !== undefined &&
      (!(flags.pollInterval > 0) || !Number.isFinite(flags.pollInterval))
    ) {
      return {
        "en-US": "--poll-interval must be a positive number.",
        "zh-CN": "--poll-interval 必须为正数。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const localize = ctx.localize;
    const image = flags.image;
    const model = flags.model || DEFAULT_MODEL;
    const sourceLang =
      flags.sourceLang === undefined || flags.sourceLang === "" ? "auto" : flags.sourceLang;
    const targetLang = flags.targetLang;

    if (!SUPPORTED_MODELS.has(model)) {
      throw new BailianError(
        localize({
          "en-US": `Unsupported model "${model}". Use qwen-mt-image or qwen-mt-image-2.0.`,
          "zh-CN": `不支持的模型 "${model}"。请使用 qwen-mt-image 或 qwen-mt-image-2.0。`,
        }),
        ExitCode.USAGE,
      );
    }

    assertImageInput(image, localize);
    assertLanguagePair(model, sourceLang, targetLang, localize);

    const localInput = !isHttpUrl(image);
    const previewImageUrl = localInput ? `<local-file:${image};pending-upload>` : image;

    const ext: NonNullable<ImageTranslationRequest["input"]["ext"]> = {};
    if (flags.domainHint !== undefined) ext.domainHint = flags.domainHint;
    const termPairs = parseTermPairs(flags.term, localize);
    if (termPairs !== undefined) {
      ext.terminologies = termPairs.map((pair) => ({ src: pair.source, tgt: pair.target }));
    }
    if (flags.imageSegment !== undefined) {
      ext.config = { imageSegment: flags.imageSegment };
    }

    const request: ImageTranslationRequest = {
      model,
      input: stripUndefined({
        image_url: previewImageUrl,
        source_lang: sourceLang,
        target_lang: targetLang,
        ext: Object.keys(ext).length > 0 ? ext : undefined,
      }) as ImageTranslationRequest["input"],
    };

    const endpointPath = image2ImagePath();

    if (settings.dryRun) {
      ctx.output.result({ endpoint: ctx.client.url(endpointPath), request });
      return;
    }

    const imageUrl = localInput ? await ctx.client.uploadFile(image, model) : image;
    const liveRequest: ImageTranslationRequest = {
      ...request,
      input: { ...request.input, image_url: imageUrl },
    };

    const submitted = await ctx.client.requestJson<DashScopeAsyncResponse>({
      path: endpointPath,
      method: "POST",
      body: liveRequest,
      async: true,
    });

    const taskId = submitted.output.task_id;
    if (flags.async) {
      ctx.output.result({ task_id: taskId, request_id: submitted.request_id });
      return;
    }

    const taskResponse = await pollDashScopeTask(ctx, taskId, {
      pollInterval: flags.pollInterval ?? 5,
    });

    const imageResultUrl = taskResponse.output.image_url;
    if (!imageResultUrl) {
      throw new BailianError(
        localize({
          "en-US": "Task succeeded but output.image_url is missing.",
          "zh-CN": "任务成功但缺少 output.image_url。",
        }),
        ExitCode.GENERAL,
      );
    }

    const outDir = resolveOutputDir(settings, {
      flagDir: flags.outDir,
      subDir: flags.outDir ? undefined : "images",
    });
    const destPath = join(outDir, `image-translate-${randomBytes(6).toString("hex")}.jpg`);
    await downloadFile(imageResultUrl, destPath, {
      quiet: settings.quiet || settings.output === "json",
    });

    const serverMessage = taskResponse.output.message;
    const result = {
      ...taskResponse,
      task_id: taskId,
      image_url: imageResultUrl,
      saved: destPath,
    };

    let text: string | undefined;
    if (settings.output === "text") {
      text = [
        `image_url: ${imageResultUrl}`,
        `saved: ${destPath}`,
        serverMessage ? `message: ${serverMessage}` : undefined,
        taskResponse.request_id ? `request_id: ${taskResponse.request_id}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n");
    }

    ctx.output.result(result, text !== undefined ? { text } : undefined);
  },
});
