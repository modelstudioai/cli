/**
 * AIGC "auto" mode → Bailian MCP mapping layer (pure logic).
 *
 * When an AIGC command resolves its effective model to the reserved value
 * `auto`, generation is routed through Bailian's official AIGC MCP servers
 * (`/api/v1/mcps/<server>/mcp`) instead of the DashScope REST endpoints. This
 * module holds the transport-agnostic pieces so they stay trivially unit
 * testable: server codes, tool names, request-argument builders, and response
 * parsers. The command layer (`packages/commands/src/commands/shared/aigc-mcp.ts`)
 * owns the connection lifecycle, the `auto` parameter gate, concurrency, disk
 * output, and localization.
 *
 * Wire contract (Phase 0 probe):
 * - Every tool resolves to `content[0].type === "text"` whose `text` is a JSON
 *   string; parse it and honour `isError`.
 * - Auth reuses the command's DashScope API key; these four servers need no
 *   marketplace activation.
 * - The MCP input surface is smaller than REST (no model/seed/watermark; TTS has
 *   no format/sample-rate/stream), so the `auto` gate rejects the extra flags.
 */

import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
import type { McpToolResult } from "./mcp.ts";

// ---- Server codes (verbatim from `bl mcp list`) ----

/** Bailian AIGC MCP server codes, keyed by modality. */
export const AIGC_MCP_SERVER = {
  image: "TextGenerateImage",
  video: "VideoGenerate",
  speech: "TextGenerateSpeech",
  asr: "SpeechGenerateText",
} as const;

// ---- Tool names ----

/** Bailian AIGC MCP tool names. Only the tools listed in the switch-interface
 * requirements doc are mapped here (no `bailian_image_fusion`, no multichannel
 * ASR): multi-image edit and other out-of-scope usages are rejected by the gate. */
export const AIGC_MCP_TOOL = {
  imageGen: "bailian_image_gen",
  imageEdit: "bailian_image_edit",
  textToVideoSubmit: "bailian_text_to_video_submit_task",
  imageToVideoSubmit: "bailian_image_to_video_submit_task",
  videoFetchResult: "bailian_text_to_video_fetch_result",
  tts: "bailian_tts",
  speechToText: "bailian_speech_to_text",
} as const;

// ---- Tool result envelope ----

/**
 * Extract and JSON-parse the inner payload carried by an AIGC MCP tool result.
 *
 * A tool-level `isError` is a server-side failure: its text is passed through
 * verbatim (AGENTS.md §3 — the CLI does not translate server errors). A missing
 * or non-object payload is an unexpected shape and fails as GENERAL.
 */
export function parseAigcToolResult(result: McpToolResult): Record<string, unknown> {
  const joinedText = result.content
    .map((part) => part.text)
    .filter((text): text is string => typeof text === "string" && text.length > 0)
    .join("\n");

  if (result.isError) {
    throw new BailianError(`Tool error: ${joinedText}`, ExitCode.GENERAL);
  }
  if (joinedText.length === 0) {
    throw new BailianError("MCP tool returned no text content.", ExitCode.GENERAL);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(joinedText);
  } catch (error) {
    throw new BailianError(
      `Failed to parse MCP tool result: ${(error as Error).message}`,
      ExitCode.GENERAL,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BailianError("MCP tool returned an unexpected payload shape.", ExitCode.GENERAL);
  }
  return parsed as Record<string, unknown>;
}

// ---- Request argument builders (pure) ----

/** Input for `bailian_image_gen`. */
export interface AigcImageGenInput {
  prompt: string;
  size?: string;
  n?: number;
  negativePrompt?: string;
  promptExtend?: boolean;
}

/** Build `bailian_image_gen` arguments, omitting undefined optional params. */
export function buildImageGenArgs(input: AigcImageGenInput): Record<string, unknown> {
  return {
    prompt: input.prompt,
    ...(input.size !== undefined ? { size: input.size } : {}),
    ...(input.n !== undefined ? { n: input.n } : {}),
    ...(input.negativePrompt !== undefined ? { negative_prompt: input.negativePrompt } : {}),
    ...(input.promptExtend !== undefined ? { prompt_extend: input.promptExtend } : {}),
  };
}

/** Input for `bailian_image_edit` (single source image only). */
export interface AigcImageEditInput {
  /** Public http(s) URL or inline base64 data URI; resolved by the command layer. */
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
}

/** Build `bailian_image_edit` arguments. */
export function buildImageEditArgs(input: AigcImageEditInput): Record<string, unknown> {
  return {
    image_url: input.imageUrl,
    prompt: input.prompt,
    ...(input.negativePrompt !== undefined ? { negative_prompt: input.negativePrompt } : {}),
  };
}

/** Input for the video submit tools (`bailian_text_to_video_submit_task` /
 * `bailian_image_to_video_submit_task`). */
export interface AigcVideoSubmitInput {
  prompt?: string;
  duration?: number;
  resolution?: string;
  /** Aspect ratio; text-to-video only. */
  ratio?: string;
  /** First-frame public URL or data URI; image-to-video only. */
  firstFrameUrl?: string;
}

/** Build `bailian_text_to_video_submit_task` arguments (text-to-video). */
export function buildTextToVideoArgs(input: AigcVideoSubmitInput): Record<string, unknown> {
  return {
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
    ...(input.ratio !== undefined ? { ratio: input.ratio } : {}),
  };
}

/** Build `bailian_image_to_video_submit_task` arguments (image-to-video). */
export function buildImageToVideoArgs(input: AigcVideoSubmitInput): Record<string, unknown> {
  return {
    ...(input.firstFrameUrl !== undefined ? { first_frame_url: input.firstFrameUrl } : {}),
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
  };
}

/** Build `bailian_text_to_video_fetch_result` arguments. */
export function buildVideoFetchArgs(taskId: string): Record<string, unknown> {
  return { task_id: taskId };
}

/** Input for `bailian_tts`. */
export interface AigcTtsInput {
  text: string;
  /** Passed through verbatim; the MCP server validates the voice enum. */
  voice?: string;
}

/** Build `bailian_tts` arguments. */
export function buildTtsArgs(input: AigcTtsInput): Record<string, unknown> {
  return {
    text: input.text,
    ...(input.voice !== undefined ? { voice: input.voice } : {}),
  };
}

/** Build `bailian_speech_to_text` arguments (synchronous). */
export function buildSpeechToTextArgs(fileUrls: string[]): Record<string, unknown> {
  return { file_urls: fileUrls };
}

// ---- Response parsers (pure) ----

/** Pull a URL out of a result entry that may be a bare string or `{ url }`. */
function extractResultUrl(entry: unknown): string | undefined {
  if (typeof entry === "string" && entry.length > 0) return entry;
  if (entry && typeof entry === "object") {
    const url = (entry as Record<string, unknown>).url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  return undefined;
}

/**
 * Parse image generate/edit results into a URL list. The MCP shape is
 * `{ request_id, results: ["<signed url>", …] }` (bare strings, unlike REST's
 * `[{ url }]`); object entries are tolerated defensively. An empty list is
 * returned as-is so the caller can raise its own command-specific message.
 */
export function parseAigcImageResults(inner: Record<string, unknown>): string[] {
  const results = inner.results;
  if (!Array.isArray(results)) {
    throw new BailianError("MCP image result is missing a `results` array.", ExitCode.GENERAL);
  }
  return results.map(extractResultUrl).filter((url): url is string => url !== undefined);
}

/** Parsed `bailian_tts` result. */
export interface AigcTtsResult {
  audioUrl: string;
  requestId?: string;
}

/** Parse the TTS result `{ result: "<wav url>", request_id }`. */
export function parseAigcTtsResult(inner: Record<string, unknown>): AigcTtsResult {
  const audioUrl = inner.result;
  if (typeof audioUrl !== "string" || audioUrl.length === 0) {
    throw new BailianError("MCP TTS result is missing an audio URL.", ExitCode.GENERAL);
  }
  const requestId = typeof inner.request_id === "string" ? inner.request_id : undefined;
  return { audioUrl, ...(requestId !== undefined ? { requestId } : {}) };
}

/** Parse a video submit result `{ task_id }` into the task id. */
export function parseAigcVideoTaskId(inner: Record<string, unknown>): string {
  const taskId = inner.task_id;
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new BailianError("MCP video submit result is missing a task_id.", ExitCode.GENERAL);
  }
  return taskId;
}

/** Parsed `bailian_text_to_video_fetch_result` result. */
export interface AigcVideoTaskResult {
  /** RUNNING / SUCCEEDED / FAILED / UNKNOWN (server-provided). */
  taskStatus: string;
  videoUrl?: string;
  taskId?: string;
}

/** Parse the video fetch result `{ task_status, video_url, task_id }`. */
export function parseAigcVideoTaskResult(inner: Record<string, unknown>): AigcVideoTaskResult {
  const taskStatus = typeof inner.task_status === "string" ? inner.task_status : "UNKNOWN";
  const videoUrl =
    typeof inner.video_url === "string" && inner.video_url.length > 0 ? inner.video_url : undefined;
  const taskId = typeof inner.task_id === "string" ? inner.task_id : undefined;
  return {
    taskStatus,
    ...(videoUrl !== undefined ? { videoUrl } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
  };
}

/**
 * Parse ASR results `{ request_id, results: ["<text>", …] }` into transcription
 * text lines. `auto` mode intentionally returns this simplified text (the MCP
 * tool exposes none of REST's sentence/speaker/timestamp structure).
 */
export function parseAigcAsrTexts(inner: Record<string, unknown>): string[] {
  const results = inner.results;
  if (!Array.isArray(results)) return [];
  return results.filter((entry): entry is string => typeof entry === "string");
}
