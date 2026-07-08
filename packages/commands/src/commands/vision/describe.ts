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
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

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

  // Local file → data URI (for small files < 10MB, fallback)
  if (!existsSync(image)) throw new BailianError(`File not found: ${image}`, ExitCode.USAGE);
  const ext = extname(image).toLowerCase();
  const mime = IMAGE_MIME_TYPES[ext];
  if (!mime)
    throw new BailianError(
      `Unsupported image format "${ext}". Supported: jpg, jpeg, png, webp`,
      ExitCode.USAGE,
    );
  const buf = readFileSync(image);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export default defineCommand({
  description: "Describe an image or video using Qwen-VL",
  auth: "apiKey",
  usageArgs: "--image <path-or-url> [--video <url>] [--prompt <text>]",
  flags: {
    image: { type: "string", valueHint: "<path-or-url>", description: "Local image path or URL" },
    video: {
      type: "array",
      valueHint: "<url>",
      description: "Video file URL or local path (mp4/mov/avi/mkv/webm)",
    },
    prompt: {
      type: "string",
      valueHint: "<text>",
      description: "Question about the content (default: auto-detected)",
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Vision model (default: qwen3-vl-plus)",
    },
  },
  exampleArgs: [
    "--image photo.jpg",
    '--image https://example.com/photo.jpg --prompt "What breed is this dog?"',
    '--video https://example.com/video.mp4 --prompt "Summarize the video content"',
    "--video ./local-video.mp4",
    '--image photo.png --prompt "Extract the text" --model qwen3-vl-plus',
  ],
  validate: (f) =>
    !f.image && !(f.video as string[] | undefined)?.length
      ? "Provide --image or --video."
      : undefined,
  async run(ctx) {
    const { settings, flags } = ctx;
    let image = flags.image;
    const videoInputs = flags.video ?? [];
    const model = flags.model || "qwen3-vl-plus";

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
        { request: { prompt, image, video: videoInputs.length ? videoInputs : undefined, model } },
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
        const { statSync } = await import("fs");
        const fileSize = statSync(image).size;
        if (fileSize > 5 * 1024 * 1024) {
          finalImageUrl = await ctx.client.uploadFile(image, model);
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
