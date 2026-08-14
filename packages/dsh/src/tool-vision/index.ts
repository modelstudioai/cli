/**
 * `bailian-cli-dsh/tool-vision`: image and video understanding through
 * `bl vision describe` (Qwen-VL).
 *
 * The tool returns TEXT, never an `ImageBlock` — that is deliberate. dsh gates
 * image content on the active route's declared input modalities in two places
 * before a plugin ever sees it (the Web UI paste pre-check and `read_image`),
 * so a text-only main model such as DeepSeek cannot receive pictures at all.
 * Handing back a description instead gives those routes vision indirectly.
 * A genuinely multimodal route does not need this tool and should paste images
 * directly.
 *
 * @module bailian-cli-dsh/tool-vision
 */
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { runBlJson } from "../shared/bl.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-tool-vision";

/** Seams this plugin registers into. */
export const inject = ["tools", "subprocess"];

export interface Config {
  /** Vision model passed to `bl vision describe --model`. */
  model?: string;
  /** Cooperative budget; video understanding uploads and is slow. */
  timeoutMs?: number;
}

export const Config: z<Config> = z.object({
  model: z.string().description("Vision model; defaults to the CLI's own default."),
  timeoutMs: z.natural().description("Cooperative timeout budget in milliseconds."),
});

const DEFAULT_TIMEOUT_MS = 180_000;

/** The OpenAI-shaped body `bl vision describe --output json` passes through. */
interface VisionResponse {
  model?: string;
  request_id?: string;
  choices?: readonly {
    message?: { content?: unknown };
  }[];
}

/** Chat content is a string or an array of typed parts; keep only the text. */
function readContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part
        ? String((part as { text: unknown }).text)
        : "",
    )
    .join("")
    .trim();
}

export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(
    defineTool({
      name: "bailian_vision_describe",
      description:
        "Understand an image or video using Aliyun Bailian's Qwen-VL models. " +
        "Accepts a local file path or a URL and returns a text description, so it works " +
        "even when the active model cannot take image input. Ask a specific question " +
        "through `prompt` (for example OCR, chart reading, or object identification) " +
        "instead of relying on the generic default.",
      parameters: {
        image: {
          type: "string",
          description: "Local image path or http(s)/oss URL. Provide this or `video`.",
        },
        video: {
          type: "array",
          items: { type: "string" },
          description:
            "Video file paths or URLs (mp4/mov/avi/mkv/webm). Local files are uploaded first.",
        },
        prompt: {
          type: "string",
          description: "Question about the content. Defaults to a plain description request.",
        },
        model: {
          type: "string",
          description: "Override the configured vision model.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string", required: true },
            model: { type: "string", required: true },
          },
        },
        render: (_args, value) => [{ type: "text", text: value.description }],
      },
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const videos = args.video ?? [];
        if (args.image === undefined && videos.length === 0) {
          throw new Error("bailian_vision_describe requires `image` or `video`.");
        }

        const argv = ["vision", "describe"];
        if (args.image !== undefined) argv.push("--image", args.image);
        for (const video of videos) argv.push("--video", video);
        if (args.prompt !== undefined) argv.push("--prompt", args.prompt);

        const model = args.model ?? config.model;
        if (model !== undefined) argv.push("--model", model);

        const response = await runBlJson<VisionResponse>(ctx, argv, {
          cwd: exec.agent?.session.header.cwd ?? process.cwd(),
          signal: exec.signal,
        });

        const description = readContent(response.choices?.[0]?.message?.content);
        if (description.length === 0) {
          throw new Error("Qwen-VL returned an empty description.");
        }

        return { description, model: response.model ?? model ?? "" };
      },
    }),
  );
}
