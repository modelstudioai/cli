import {
  defineCommand,
  chatPath,
  detectOutputFormat,
  type ChatRequest,
  type ChatResponse,
  type ChatMessageContent,
  BailianError,
  ExitCode,
  isLocalFile,
  imageFileToDataUri,
  redactDataUri,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { existsSync, statSync } from "fs";
import { extname } from "path";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"]);

function isVideoInput(input: string): boolean {
  // Check by extension
  const ext = extname(input).toLowerCase().split("?")[0]!;
  if (VIDEO_EXTENSIONS.has(ext)) return true;
  // URL heuristic: contains common video extensions
  if (/\.(mp4|mov|avi|mkv|webm|flv|wmv)(\?|$)/i.test(input)) return true;
  return false;
}

async function toImageUrl(image: string): Promise<string> {
  if (image.startsWith("data:")) return image;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  if (image.startsWith("oss://")) return image;
  return imageFileToDataUri(image);
}

export default defineCommand({
  description: {
    "en-US": "Describe an image or video using Qwen-VL",
    "zh-CN": "使用 Qwen-VL 描述图片或视频",
  },
  auth: "apiKey",
  usageArgs: "--image <path-or-url> [--video <url>] [--prompt <text>]",
  flags: {
    image: {
      type: "string",
      valueHint: "<path-or-url>",
      description: { "en-US": "Local image path or URL", "zh-CN": "本地图片路径或 URL" },
    },
    video: {
      type: "array",
      valueHint: "<url>",
      description: {
        "en-US": "Video file URL or local path (mp4/mov/avi/mkv/webm)",
        "zh-CN": "视频文件 URL 或本地路径（mp4/mov/avi/mkv/webm）",
      },
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: {
        "en-US": "Question about the content (default: auto-detected)",
        "zh-CN": "针对内容的问题（默认：自动识别）",
      },
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Vision model (default: qwen3-vl-plus)",
        "zh-CN": "视觉模型（默认：qwen3-vl-plus）",
      },
    },
  },
  exampleArgs: [
    "--image photo.jpg",
    {
      "en-US": '--image https://example.com/photo.jpg --prompt "What breed is this dog?"',
      "zh-CN": '--image https://example.com/photo.jpg --prompt "这只狗是什么品种？"',
    },
    {
      "en-US": '--video https://example.com/video.mp4 --prompt "Summarize the video content"',
      "zh-CN": '--video https://example.com/video.mp4 --prompt "总结视频内容"',
    },
    "--video ./local-video.mp4",
    {
      "en-US": '--image photo.png --prompt "Extract the text" --model qwen3-vl-plus',
      "zh-CN": '--image photo.png --prompt "提取文字" --model qwen3-vl-plus',
    },
  ],
  validate: (f) =>
    !f.image && !(f.video as string[] | undefined)?.length
      ? "Provide --image or --video."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    let image = flags.image;
    const videoInputs = flags.video ?? [];
    const model =
      flags.model ||
      (ctx.client.usesTokenPlanEndpoint() ? settings.defaultTextModel : undefined) ||
      "qwen3-vl-plus";

    // Auto-detect: if --image was given a video file, treat it as --video
    if (image && isVideoInput(image)) {
      videoInputs.push(image);
      image = undefined;
    }

    const hasVideo = videoInputs.length > 0;
    const defaultPrompt = hasVideo ? "Describe the video." : "Describe the image.";
    const prompt = flags.prompt || defaultPrompt;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          request: {
            prompt,
            image: image ? redactDataUri(image) : undefined,
            video: videoInputs.length ? videoInputs.map(redactDataUri) : undefined,
            model,
          },
        },
        format,
      );
      return;
    }

    const contentArray: ChatMessageContent[] = [];
    // ---- Handle video inputs ----
    if (videoInputs.length > 0) {
      for (const videoInput of videoInputs) {
        let videoUrl = videoInput;

        // Local video file → upload to OSS
        if (isLocalFile(videoInput)) {
          if (!existsSync(videoInput)) {
            throw new BailianError(`Video file not found: ${videoInput}`, ExitCode.USAGE);
          }
          videoUrl = await ctx.client.uploadFile(videoInput, model);
        }

        contentArray.push({ type: "video_url", video_url: { url: videoUrl } });
      }
    }

    // ---- Handle image input ----
    if (image) {
      const imageUrl = await toImageUrl(image);

      let finalImageUrl = imageUrl;
      if (isLocalFile(image) && imageUrl.startsWith("data:")) {
        const fileSize = statSync(image).size;
        if (fileSize > 5 * 1024 * 1024) {
          finalImageUrl = await ctx.client.resolveImageInput(image, model);
        }
      }

      contentArray.push({ type: "image_url", image_url: { url: finalImageUrl } });
    }

    // ---- Text prompt ----
    contentArray.push({ type: "text", text: prompt });

    const body: ChatRequest = {
      model,
      messages: [
        {
          role: "user",
          content: contentArray,
        },
      ],
    };

    const response = await ctx.client.requestJson<ChatResponse>({
      path: chatPath(),
      method: "POST",
      body,
    });

    const content = response.choices?.[0]?.message?.content;

    if (format !== "text") {
      emitResult(response, format);
      return;
    }

    emitBare((content || "") as string);
  },
});
