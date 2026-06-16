import {
  defineCommand,
  requestJson,
  chatEndpoint,
  detectOutputFormat,
  type ChatRequest,
  type ChatResponse,
  type ChatMessageContent,
  isInteractive,
  resolveFileUrl,
  resolveCredential,
  BailianError,
  ExitCode,
  isLocalFile,
} from "bailian-cli-core";
import { promptText } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";
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
  name: "vision describe",
  description: "Describe an image or video using Qwen-VL",
  usage: "bl vision describe --image <path-or-url> [--video <url>] [--prompt <text>]",
  options: [
    { flag: "--image <path-or-url>", description: "Local image path or URL" },
    {
      flag: "--video <url>",
      description: "Video file URL or local path (mp4/mov/avi/mkv/webm)",
      type: "array",
    },
    { flag: "--prompt <text>", description: "Question about the content (default: auto-detected)" },
    { flag: "--model <model>", description: "Vision model (default: qwen3-vl-plus)" },
  ],
  examples: [
    "bl vision describe --image photo.jpg",
    'bl vision describe --image https://example.com/photo.jpg --prompt "这只狗是什么品种？"',
    'bl vision describe --video https://example.com/video.mp4 --prompt "总结视频内容"',
    "bl vision describe --video ./local-video.mp4",
    'bl vision describe --image photo.png --prompt "Extract the text" --model qwen-vl-plus',
  ],
  async run(config, flags) {
    let image = flags.image ?? (flags._positional as string[] | undefined)?.[0];
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

    if (!image && !hasVideo) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({
          message: "Enter image/video path or URL:",
        });
        if (!hint) {
          process.stderr.write("Vision describe cancelled.\n");
          process.exit(1);
        }
        // Detect if user entered a video
        if (isVideoInput(hint)) {
          videoInputs.push(hint);
        } else {
          image = hint;
        }
      } else {
        throw new BailianError(
          "Missing required argument --image or --video.",
          ExitCode.USAGE,
          "bl vision describe --image <path-or-url>\nbl vision describe --video <url-or-path>",
        );
      }
    }

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
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
          const credential = await resolveCredential(config);
          videoUrl = await resolveFileUrl(videoInput, credential.token, model);
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
          const credential = await resolveCredential(config);
          finalImageUrl = await resolveFileUrl(image, credential.token, model);
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

    const url = chatEndpoint(config.baseUrl);
    const response = await requestJson<ChatResponse>(config, {
      url,
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
