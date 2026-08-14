/**
 * `bailian-cli-dsh/tool-image`: image generation through `bl image generate`.
 *
 * Delegating to the CLI keeps the async-task polling, model-to-endpoint
 * routing, and artifact download in one place rather than restating them here.
 *
 * Generated files are committed to `ctx.attachments` and returned as
 * `ImageBlock`s when the calling route declares image input. When it does not
 * — DeepSeek routes never do — the tool degrades to reporting the saved paths
 * instead of failing, so the model can hand one to `bailian_vision_describe`.
 * For that fallback to work the files must survive the call, so this tool
 * deliberately does not delete what the CLI wrote.
 *
 * @module bailian-cli-dsh/tool-image
 */
import type { Context } from "@deepseek-ai/cordis";
import type { ImageAttachmentRef, ImageMediaType } from "@deepseek-ai/dsh-attachment";
import { AttachmentId } from "@deepseek-ai/dsh-attachment";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-fs";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { runBlJson } from "../shared/bl.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-tool-image";

/** Seams this plugin registers into. */
export const inject = ["tools", "subprocess", "fs"];

export interface Config {
  /** Image model passed to `bl image generate --model`. */
  model?: string;
  /** Directory for generated files; defaults to the CLI's own output dir. */
  outDir?: string;
  /** Cooperative budget; async models poll until the task succeeds. */
  timeoutMs?: number;
}

export const Config: z<Config> = z.object({
  model: z.string().description("Image model; defaults to the CLI's own default."),
  outDir: z.string().description("Directory for generated files."),
  timeoutMs: z.natural().description("Cooperative timeout budget in milliseconds."),
});

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_IMAGES = 6;

const MEDIA_TYPE_BY_EXTENSION: Readonly<Record<string, ImageMediaType>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

interface ImageGenerateResponse {
  urls?: readonly string[];
  saved?: readonly string[];
  total?: number;
}

/** One committed image, stored as plain JSON so `render` stays pure. */
interface CommittedImage {
  attachmentId: string;
  mediaType: ImageMediaType;
  bytes: number;
  width: number;
  height: number;
  path: string;
}

function mediaTypeOf(path: string): ImageMediaType | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension === undefined ? undefined : MEDIA_TYPE_BY_EXTENSION[extension];
}

function attachmentRefOf(image: CommittedImage): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
  };
}

/**
 * Whether the calling route declares image input. Unlike `read_image`'s hard
 * gate this only reports, because an unroutable or text-only model is a reason
 * to fall back to paths rather than to refuse generating anything.
 */
async function routeAcceptsImages(ctx: Context, exec: ToolExecution): Promise<boolean> {
  const routed = exec.agent?.session.requestHeader()?.config;
  const provider = routed?.provider ?? exec.agent?.options.provider;
  const model = routed?.model ?? exec.agent?.options.model;
  const llm = ctx.get("llm");
  if (provider === undefined || model === undefined || llm === undefined) return false;
  try {
    const active = await llm.resolveModelInfo(provider, model, exec.signal);
    return active.inputModalities?.includes("image") === true;
  } catch {
    return false;
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(
    defineTool({
      name: "bailian_image_generate",
      description:
        "Generate images from a text prompt using Aliyun Bailian (Qwen-Image / Wan). " +
        "Files are written to disk and returned inline when the active model can view " +
        "images; otherwise the saved paths are reported and you can inspect one with " +
        "`bailian_vision_describe`.",
      parameters: {
        prompt: {
          type: "string",
          required: true,
          description: "What to depict. Be specific about subject, style, and composition.",
        },
        model: { type: "string", description: "Override the configured image model." },
        size: {
          type: "string",
          description: 'Aspect ratio such as "1:1" / "16:9", or explicit pixels as "1024*1024".',
        },
        n: {
          type: "integer",
          description: `How many images to generate (1-${MAX_IMAGES}).`,
        },
        negative_prompt: { type: "string", description: "What to avoid depicting." },
        seed: { type: "integer", description: "Seed for reproducible generation." },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            images: {
              type: "array",
              required: true,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  attachmentId: { type: "string", required: true },
                  mediaType: { type: "string", required: true },
                  bytes: { type: "integer", required: true },
                  width: { type: "integer", required: true },
                  height: { type: "integer", required: true },
                  path: { type: "string", required: true },
                },
              },
            },
            paths: { type: "array", required: true, items: { type: "string" } },
            urls: { type: "array", required: true, items: { type: "string" } },
          },
        },
        render: (_args, value) => {
          const paths = value.paths.join("\n");
          if (value.images.length === 0) {
            return [
              {
                type: "text",
                text:
                  `Generated ${value.paths.length} image(s); the active model cannot view ` +
                  `images, so they are on disk only. Use bailian_vision_describe to inspect ` +
                  `one.\n${paths}`,
              },
            ];
          }
          const blocks: ContentBlock[] = [
            { type: "text", text: `Generated ${value.images.length} image(s):\n${paths}` },
          ];
          for (const image of value.images) {
            blocks.push({ type: "image", attachment: attachmentRefOf(image as CommittedImage) });
          }
          return blocks;
        },
      },
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      async execute(args, exec) {
        if (args.n !== undefined && (args.n < 1 || args.n > MAX_IMAGES)) {
          throw new Error(`bailian_image_generate accepts n between 1 and ${MAX_IMAGES}.`);
        }

        const cwd = exec.agent?.session.header.cwd ?? process.cwd();
        const argv = ["image", "generate", "--prompt", args.prompt];
        const model = args.model ?? config.model;
        if (model !== undefined) argv.push("--model", model);
        if (args.size !== undefined) argv.push("--size", args.size);
        if (args.n !== undefined) argv.push("--n", String(args.n));
        if (args.negative_prompt !== undefined)
          argv.push("--negative-prompt", args.negative_prompt);
        if (args.seed !== undefined) argv.push("--seed", String(args.seed));
        if (config.outDir !== undefined) argv.push("--out-dir", config.outDir);

        const response = await runBlJson<ImageGenerateResponse>(ctx, argv, {
          cwd,
          signal: exec.signal,
        });

        const paths = [...(response.saved ?? [])];
        const urls = [...(response.urls ?? [])];
        if (paths.length === 0) {
          throw new Error("bl image generate reported no saved files.");
        }

        const attachments = ctx.get("attachments");
        const images: CommittedImage[] = [];
        if (attachments !== undefined && (await routeAcceptsImages(ctx, exec))) {
          const byteCap = Math.min(
            attachments.imageLimits.maxImageBytes,
            attachments.imageLimits.maxMessageImageBytes,
          );
          for (const path of paths) {
            const mediaType = mediaTypeOf(path);
            if (mediaType === undefined || !attachments.imageLimits.mediaTypes.includes(mediaType))
              continue;
            const target = await ctx.fs.resolve(path, { cwd, signal: exec.signal });
            const data = await ctx.fs.readBytes(target, exec.signal, byteCap);
            const ref = await attachments.saveImage({ data, mediaType, name: target.displayPath });
            images.push({
              attachmentId: ref.attachmentId,
              mediaType: ref.mediaType,
              bytes: ref.bytes,
              width: ref.width,
              height: ref.height,
              path,
            });
          }
        }

        return { images, paths, urls };
      },
    }),
  );
}
