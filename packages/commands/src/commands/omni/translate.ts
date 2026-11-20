import {
  defineCommand,
  multimodalGenerationPath,
  taskPath,
  ASYNC_FLAG,
  BailianError,
  ExitCode,
  resolveOutputDir,
  stripUndefined,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  type FlagsDef,
  type LocalizedText,
  type QwenMtUniRequest,
} from "bailian-cli-core";
import { downloadFile, poll } from "bailian-cli-runtime";
import { existsSync, statSync } from "fs";
import { extname, join } from "path";
import { randomBytes } from "crypto";

const DEFAULT_MODEL = "qwen-mt-uni";
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "txt",
  "html",
  "htm",
  "md",
  "markdown",
  "mdown",
  "mkd",
  "png",
  "jpg",
  "jpeg",
  "mp3",
  "wav",
]);

const REJECTED_EXTENSIONS = new Set(["doc", "ppt", "mp4", "mov", "avi", "mkv", "webm"]);

const OUTPUT_EXTENSION_BY_INPUT: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  txt: "txt",
  html: "html",
  htm: "html",
  md: "md",
  markdown: "md",
  mdown: "md",
  mkd: "md",
  png: "jpg",
  jpg: "jpg",
  jpeg: "jpg",
  mp3: "mp3",
  wav: "mp3",
};

const OUTPUT_EXTENSION_BY_FILE_TYPE: Record<string, string> = {
  pdf: "pdf",
  document: "docx",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  txt: "txt",
  html: "html",
  md: "md",
  markdown: "md",
  image: "jpg",
  jpg: "jpg",
  jpeg: "jpg",
  png: "jpg",
  audio: "mp3",
  mp3: "mp3",
  wav: "mp3",
};

const TRANSLATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Document, image or audio URL/local file",
      "zh-CN": "文档、图片或音频 URL/本地文件",
    },
    required: true,
  },
  targetLang: {
    type: "string",
    valueHint: "<lang>",
    description: {
      "en-US": "Target language code or name",
      "zh-CN": "目标语言代码或名称",
    },
    required: true,
  },
  sourceLang: {
    type: "string",
    valueHint: "<lang>",
    description: {
      "en-US": "Source language (omit to auto-detect; do not send auto)",
      "zh-CN": "源语言（省略则自动检测；不发送 auto）",
    },
  },
  formatHint: {
    type: "string",
    valueHint: "<type>",
    description: {
      "en-US": "Format hint when URL has no extension (e.g. pdf, image)",
      "zh-CN": "URL 无后缀时的格式提示（如 pdf、image）",
    },
  },
  domainHint: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "English domain hint ≤200 words (ext.domainHint)",
      "zh-CN": "英文领域提示，不超过 200 词（ext.domainHint）",
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

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hasNonAscii(value: string): boolean {
  for (const char of value) {
    if ((char.codePointAt(0) ?? 0) > 0x7f) return true;
  }
  return false;
}

function pathExtension(source: string): string {
  const pathPart = source.split("?")[0]?.split("#")[0] ?? source;
  return extname(pathPart).slice(1).toLowerCase();
}

function assertFileInput(
  file: string,
  formatHint: string | undefined,
  localize: (text: LocalizedText) => string,
): { local: boolean; extension: string | undefined } {
  if (!file) {
    throw new BailianError(
      localize({
        "en-US": "--file must not be empty.",
        "zh-CN": "--file 不能为空。",
      }),
      ExitCode.USAGE,
    );
  }

  if (isHttpUrl(file)) {
    if (hasNonAscii(file)) {
      throw new BailianError(
        localize({
          "en-US": "File URL must not contain non-ASCII characters.",
          "zh-CN": "文件 URL 不能包含非 ASCII 字符。",
        }),
        ExitCode.USAGE,
      );
    }
    const extension = pathExtension(file);
    if (REJECTED_EXTENSIONS.has(extension)) {
      throw new BailianError(
        localize({
          "en-US": `Unsupported file type ".${extension}". Convert Office legacy formats to docx/pptx; video is not supported.`,
          "zh-CN": `不支持的文件类型 ".${extension}"。请将旧版 Office 转为 docx/pptx；不支持视频。`,
        }),
        ExitCode.USAGE,
      );
    }
    if (!extension && !formatHint) {
      throw new BailianError(
        localize({
          "en-US": "URL has no recognizable extension. Pass --format-hint (e.g. pdf, image, mp3).",
          "zh-CN": "URL 无可识别后缀。请传 --format-hint（如 pdf、image、mp3）。",
        }),
        ExitCode.USAGE,
      );
    }
    if (extension && !SUPPORTED_EXTENSIONS.has(extension) && !formatHint) {
      throw new BailianError(
        localize({
          "en-US": `Unsupported file type ".${extension}".`,
          "zh-CN": `不支持的文件类型 ".${extension}"。`,
        }),
        ExitCode.USAGE,
      );
    }
    return { local: false, extension: extension || undefined };
  }

  if (!existsSync(file)) {
    throw new BailianError(
      localize({
        "en-US": `File not found: ${file}`,
        "zh-CN": `文件不存在：${file}`,
      }),
      ExitCode.USAGE,
    );
  }
  const stats = statSync(file);
  if (!stats.isFile()) {
    throw new BailianError(
      localize({
        "en-US": `Not a file: ${file}`,
        "zh-CN": `不是文件：${file}`,
      }),
      ExitCode.USAGE,
    );
  }
  if (stats.size > MAX_FILE_BYTES) {
    throw new BailianError(
      localize({
        "en-US": `File exceeds 100 MB: ${file}`,
        "zh-CN": `文件超过 100 MB：${file}`,
      }),
      ExitCode.USAGE,
    );
  }

  const extension = pathExtension(file);
  if (REJECTED_EXTENSIONS.has(extension)) {
    throw new BailianError(
      localize({
        "en-US": `Unsupported file type ".${extension}". Convert Office legacy formats to docx/pptx; video is not supported.`,
        "zh-CN": `不支持的文件类型 ".${extension}"。请将旧版 Office 转为 docx/pptx；不支持视频。`,
      }),
      ExitCode.USAGE,
    );
  }
  if (!extension && !formatHint) {
    throw new BailianError(
      localize({
        "en-US": "Local file has no extension. Pass --format-hint.",
        "zh-CN": "本地文件无后缀。请传 --format-hint。",
      }),
      ExitCode.USAGE,
    );
  }
  if (extension && !SUPPORTED_EXTENSIONS.has(extension) && !formatHint) {
    throw new BailianError(
      localize({
        "en-US": `Unsupported file type ".${extension}".`,
        "zh-CN": `不支持的文件类型 ".${extension}"。`,
      }),
      ExitCode.USAGE,
    );
  }
  return { local: true, extension: extension || undefined };
}

function resolveOutputExtension(
  fileType: string | undefined,
  inputExtension: string | undefined,
  formatHint: string | undefined,
): string {
  if (fileType) {
    const mapped = OUTPUT_EXTENSION_BY_FILE_TYPE[fileType.toLowerCase()];
    if (mapped) return mapped;
  }
  if (inputExtension) {
    const mapped = OUTPUT_EXTENSION_BY_INPUT[inputExtension];
    if (mapped) return mapped;
  }
  if (formatHint) {
    const mapped =
      OUTPUT_EXTENSION_BY_INPUT[formatHint.toLowerCase()] ||
      OUTPUT_EXTENSION_BY_FILE_TYPE[formatHint.toLowerCase()];
    if (mapped) return mapped;
  }
  return "bin";
}

export default defineCommand({
  description: {
    "en-US": "Translate a document, image or audio file (Qwen-MT-Uni)",
    "zh-CN": "翻译文档、图片或音频文件（Qwen-MT-Uni）",
  },
  auth: "apiKey",
  usageArgs: "--file <url-or-path> --target-lang <lang> [flags]",
  flags: TRANSLATE_FLAGS,
  exampleArgs: [
    {
      "en-US": "--file ./brochure.pdf --target-lang en --dry-run --output json",
      "zh-CN": "--file ./brochure.pdf --target-lang en --dry-run --output json",
    },
    {
      "en-US":
        "--file https://example.com/brochure.pdf --target-lang en --format-hint pdf --async --output json",
      "zh-CN":
        "--file https://example.com/brochure.pdf --target-lang en --format-hint pdf --async --output json",
    },
  ],
  notes: [
    {
      "en-US":
        "Always submits asynchronously. Use --async to return the task ID immediately. Task SUCCEEDED still requires output.Success=true before download. Query with `video task get --task-id`. Supported: pdf/docx/pptx/xlsx/txt/html/md/png/jpg/mp3/wav. Video and legacy doc/ppt are rejected.",
      "zh-CN":
        "始终异步提交。使用 --async 立即返回任务 ID。任务 SUCCEEDED 仍需 output.Success=true 才会下载。可用 `video task get --task-id` 查询。支持：pdf/docx/pptx/xlsx/txt/html/md/png/jpg/mp3/wav。拒绝视频与旧版 doc/ppt。",
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
    const file = flags.file;
    const targetLang = flags.targetLang;
    const model = DEFAULT_MODEL;

    if (!targetLang) {
      throw new BailianError(
        localize({
          "en-US": "--target-lang must not be empty.",
          "zh-CN": "--target-lang 不能为空。",
        }),
        ExitCode.USAGE,
      );
    }

    const inputInfo = assertFileInput(file, flags.formatHint, localize);

    const previewFileUrl = inputInfo.local ? `<local-file:${file};pending-upload>` : file;
    const ext: NonNullable<QwenMtUniRequest["input"]["ext"]> = {};
    if (flags.formatHint !== undefined) ext.format_hint = flags.formatHint;
    if (flags.domainHint !== undefined) ext.domainHint = flags.domainHint;

    const requestInput: QwenMtUniRequest["input"] = stripUndefined({
      fileUrl: previewFileUrl,
      target_lang: targetLang,
      source_lang:
        flags.sourceLang === undefined || flags.sourceLang === "" ? undefined : flags.sourceLang,
      ext: Object.keys(ext).length > 0 ? ext : undefined,
    }) as QwenMtUniRequest["input"];

    const request: QwenMtUniRequest = { model, input: requestInput };
    const endpoint = multimodalGenerationPath();

    if (settings.dryRun) {
      ctx.output.result({ endpoint, request });
      return;
    }

    const fileUrl = inputInfo.local ? await ctx.client.uploadFile(file, model) : file;
    const liveRequest: QwenMtUniRequest = {
      ...request,
      input: { ...request.input, fileUrl },
    };

    const submitted = await ctx.client.requestJson<DashScopeAsyncResponse>({
      path: endpoint,
      method: "POST",
      body: liveRequest,
      async: true,
    });

    const taskId = submitted.output.task_id;
    if (flags.async) {
      ctx.output.result({ task_id: taskId, request_id: submitted.request_id });
      return;
    }

    const pollInterval = flags.pollInterval ?? 5;
    const taskResponse = await poll<DashScopeTaskResponse>(ctx.client, {
      output: ctx.output,
      url: ctx.client.url(taskPath(taskId)),
      intervalSec: pollInterval,
      timeoutSec: settings.timeout,
      load: async () => {
        const data = await ctx.client.requestJson<DashScopeTaskResponse>({
          path: taskPath(taskId),
        });
        const status = data.output.task_status;
        if (status === "FAILED") {
          const message =
            data.output.Message || data.output.message || data.output.code || "Task failed.";
          throw new BailianError(String(message), ExitCode.GENERAL, undefined, {
            api: {
              apiCode: data.output.Code !== undefined ? String(data.output.Code) : data.output.code,
              requestId: data.output.RequestId || data.request_id,
            },
          });
        }
        if (status === "CANCELED" || status === "UNKNOWN") {
          throw new BailianError(
            localize({
              "en-US": `Task ended with status ${status}.`,
              "zh-CN": `任务以状态 ${status} 结束。`,
            }),
            ExitCode.GENERAL,
            undefined,
            {
              api: {
                apiCode:
                  data.output.Code !== undefined ? String(data.output.Code) : data.output.code,
                requestId: data.output.RequestId || data.request_id,
              },
            },
          );
        }
        // SUCCEEDED is terminal: missing / non-true Success is a business failure, not "still running".
        if (status === "SUCCEEDED" && data.output.Success !== true) {
          const message = data.output.Message || "Translation business call failed.";
          throw new BailianError(String(message), ExitCode.GENERAL, undefined, {
            api: {
              apiCode: data.output.Code !== undefined ? String(data.output.Code) : undefined,
              requestId: data.output.RequestId || data.request_id,
            },
          });
        }
        return data;
      },
      isComplete: (data) => (data as DashScopeTaskResponse).output.task_status === "SUCCEEDED",
      isFailed: () => false,
      getStatus: (data) => (data as DashScopeTaskResponse).output.task_status,
    });

    const translatedUrl = taskResponse.output.Data?.TranslatedFileUrl;
    if (!translatedUrl) {
      throw new BailianError(
        localize({
          "en-US": "Task succeeded but output.Data.TranslatedFileUrl is missing.",
          "zh-CN": "任务成功但缺少 output.Data.TranslatedFileUrl。",
        }),
        ExitCode.GENERAL,
      );
    }

    const outDir = resolveOutputDir(settings, {
      flagDir: flags.outDir,
      subDir: flags.outDir ? undefined : "translations",
    });
    const extension = resolveOutputExtension(
      taskResponse.output.Data?.FileType,
      inputInfo.extension,
      flags.formatHint,
    );
    // Safe local basename only — never trust remote URL path segments.
    const destPath = join(outDir, `omni-translate-${randomBytes(6).toString("hex")}.${extension}`);

    await downloadFile(translatedUrl, destPath, {
      quiet: settings.quiet || settings.output === "json",
    });

    const result = {
      ...taskResponse,
      task_id: taskId,
      translated_file_url: translatedUrl,
      saved: destPath,
    };

    let text: string | undefined;
    if (settings.output === "text") {
      const fileType = taskResponse.output.Data?.FileType;
      text = [
        `translated_file_url: ${translatedUrl}`,
        `saved: ${destPath}`,
        fileType ? `file_type: ${fileType}` : undefined,
        taskResponse.request_id ? `request_id: ${taskResponse.request_id}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n");
    }

    ctx.output.result(result, text !== undefined ? { text } : undefined);
  },
});
