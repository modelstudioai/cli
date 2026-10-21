/**
 * AIGC "auto" mode — command-side glue.
 *
 * When an AIGC command resolves its effective model to the reserved value
 * `auto`, generation is routed through Bailian's official AIGC MCP servers
 * instead of the DashScope REST endpoints. This module owns everything that
 * needs a {@link CommandContext}: the `auto` check, the parameter
 * compatibility gate (flags MCP cannot honor → USAGE error, no silent REST
 * fallback), and a shared-session MCP call wrapper that `--concurrent` fan-out
 * reuses.
 *
 * The transport-agnostic mapping (server codes, tool names, request-argument
 * builders, response parsers) lives in core — `bailian-cli-core` re-exports
 * `packages/core/src/client/aigc-mcp.ts`.
 */

import {
  BailianError,
  ExitCode,
  parseAigcToolResult,
  imageFileToDataUri,
  audioFileToDataUri,
  MCP_CALL_SERVICE,
  type Client,
  type LocalizedText,
  type McpConnectedClient,
} from "bailian-cli-core";

/** Localizer supplied by the runtime (`CommandContext.localize`). */
export type Localize = (text: LocalizedText) => string;

/** The reserved model value that routes an AIGC command through MCP. */
export const AUTO_MODEL = "auto";

/** True when the resolved effective model is the reserved `auto` value. */
export function isAutoModel(model: string | undefined): boolean {
  return model === AUTO_MODEL;
}

// ---- Parameter compatibility gate ----

/** AIGC operations that can be routed through MCP in `auto` mode. */
export type AigcMcpOperation =
  | "imageGen"
  | "imageEdit"
  | "videoTextToVideo"
  | "videoImageToVideo"
  | "tts"
  | "asr";

interface IncompatibleFlag {
  /** Key in the command's `ParsedFlags`. */
  key: string;
  /** CLI flag name shown to the user (kebab-case, with leading `--`). */
  flag: string;
  /** Switch flags are "present" when `true`; value flags when `!== undefined`. */
  kind: "switch" | "value";
}

function switchFlag(key: string, flag: string): IncompatibleFlag {
  return { key, flag, kind: "switch" };
}

function valueFlag(key: string, flag: string): IncompatibleFlag {
  return { key, flag, kind: "value" };
}

/**
 * Per-operation flags that MCP cannot honor in `auto` mode; presence of any of
 * them raises `BailianError(USAGE)`. Derived from the live tool inputSchemas:
 * `bailian_image_gen`(prompt/size/negative_prompt/prompt_extend/n),
 * `bailian_image_edit`(image_url/prompt/negative_prompt),
 * `bailian_text_to_video_submit_task`(prompt/duration/resolution/ratio),
 * `bailian_image_to_video_submit_task`(first_frame_url/prompt/duration/resolution),
 * `bailian_tts`(text/voice), `bailian_speech_to_text`(file_urls). MCP has no
 * model/seed/watermark concept and TTS has no format/sample-rate/stream, so the
 * corresponding flags are rejected. CLI-local output flags (`--out*`,
 * `--download`) and `--concurrent` are honored on this side and stay allowed.
 */
const MCP_INCOMPATIBLE_FLAGS: Record<AigcMcpOperation, readonly IncompatibleFlag[]> = {
  imageGen: [
    valueFlag("seed", "--seed"),
    valueFlag("watermark", "--watermark"),
    switchFlag("async", "--async"),
  ],
  imageEdit: [
    valueFlag("size", "--size"),
    valueFlag("n", "--n"),
    valueFlag("seed", "--seed"),
    valueFlag("function", "--function"),
    valueFlag("promptExtend", "--prompt-extend"),
    valueFlag("watermark", "--watermark"),
    switchFlag("async", "--async"),
  ],
  videoTextToVideo: [
    valueFlag("lastFrame", "--last-frame"),
    valueFlag("file", "--file"),
    valueFlag("negativePrompt", "--negative-prompt"),
    valueFlag("promptExtend", "--prompt-extend"),
    valueFlag("watermark", "--watermark"),
    valueFlag("seed", "--seed"),
    switchFlag("prime", "--prime"),
    valueFlag("workspaceId", "--workspace-id"),
    switchFlag("async", "--async"),
  ],
  videoImageToVideo: [
    valueFlag("ratio", "--ratio"),
    valueFlag("lastFrame", "--last-frame"),
    valueFlag("file", "--file"),
    valueFlag("negativePrompt", "--negative-prompt"),
    valueFlag("promptExtend", "--prompt-extend"),
    valueFlag("watermark", "--watermark"),
    valueFlag("seed", "--seed"),
    switchFlag("prime", "--prime"),
    valueFlag("workspaceId", "--workspace-id"),
    switchFlag("async", "--async"),
  ],
  tts: [
    switchFlag("listVoices", "--list-voices"),
    valueFlag("format", "--format"),
    valueFlag("sampleRate", "--sample-rate"),
    valueFlag("volume", "--volume"),
    valueFlag("rate", "--rate"),
    valueFlag("pitch", "--pitch"),
    valueFlag("seed", "--seed"),
    valueFlag("language", "--language"),
    valueFlag("instruction", "--instruction"),
    switchFlag("enableSsml", "--enable-ssml"),
    switchFlag("stream", "--stream"),
  ],
  asr: [
    valueFlag("language", "--language"),
    switchFlag("diarization", "--diarization"),
    valueFlag("speakerCount", "--speaker-count"),
    valueFlag("vocabularyId", "--vocabulary-id"),
    valueFlag("vocabulary", "--vocabulary"),
    valueFlag("context", "--context"),
    valueFlag("channelId", "--channel-id"),
    switchFlag("async", "--async"),
  ],
};

function isFlagPresent(flags: Record<string, unknown>, spec: IncompatibleFlag): boolean {
  const value = flags[spec.key];
  if (spec.kind === "switch") return value === true;
  return value !== undefined;
}

/**
 * Build the localized USAGE error for `auto` mode rejecting flags/usage MCP
 * cannot honor. Exported so command-local checks (e.g. multi-image edit) can
 * raise a consistent message.
 */
export function mcpUnsupportedError(localize: Localize, names: string[]): BailianError {
  const list = names.join(", ");
  const many = names.length > 1;
  const message = localize({
    "en-US": `The current model (auto) does not support ${list}. Switch to a specific model or remove ${many ? "these flags" : "this flag"}.`,
    "zh-CN": `当前模型（auto）不支持参数 ${list}，请切换为具体模型或移除${many ? "这些参数" : "该参数"}。`,
  });
  const hint = localize({
    "en-US":
      'Pass --model <id> to use a specific model, or set a concrete default model in your config instead of "auto".',
    "zh-CN": '传入 --model <id> 指定具体模型，或在配置中把默认模型设为具体值而非 "auto"。',
  });
  return new BailianError(message, ExitCode.USAGE, hint);
}

/**
 * Reject any flag MCP cannot honor for `operation` in `auto` mode. Throws
 * `BailianError(USAGE)`; never falls back to REST silently.
 */
export function assertMcpCompatible(
  operation: AigcMcpOperation,
  flags: Record<string, unknown>,
  localize: Localize,
): void {
  const offending = MCP_INCOMPATIBLE_FLAGS[operation]
    .filter((spec) => isFlagPresent(flags, spec))
    .map((spec) => spec.flag);
  if (offending.length > 0) {
    throw mcpUnsupportedError(localize, offending);
  }
}

/** `auto` image edit accepts a single source image only (no `bailian_image_fusion`). */
export function mcpSingleImageOnlyError(localize: Localize): BailianError {
  const message = localize({
    "en-US":
      "The current model (auto) supports editing a single image only; multiple --image inputs are not supported. Switch to a specific model or pass one image.",
    "zh-CN":
      "当前模型（auto）仅支持单图编辑，不支持多个 --image 输入。请切换为具体模型或只传入一张图片。",
  });
  const hint = localize({
    "en-US":
      'Pass --model <id> to use a specific model, or set a concrete default model in your config instead of "auto".',
    "zh-CN": '传入 --model <id> 指定具体模型，或在配置中把默认模型设为具体值而非 "auto"。',
  });
  return new BailianError(message, ExitCode.USAGE, hint);
}

// ---- Local file input (auto mode inlines files as base64 data URIs) ----

/**
 * Conservative cap on the inline base64 data-URI size sent through MCP. The
 * AIGC MCP servers accept a public http(s) URL or a base64 data URI but reject
 * `oss://` and private upload URLs, so `auto` mode inlines local files; an
 * oversized payload would bloat the JSON-RPC body and fail obscurely, so it is
 * rejected up front with an actionable message.
 */
const MAX_MCP_DATA_URI_BYTES = 10 * 1024 * 1024;

/** True for inputs already carrying a URL / inline scheme (not a local path). */
function isUrlScheme(source: string): boolean {
  return /^(https?|oss|data):/i.test(source);
}

function guardDataUriSize(dataUri: string, kind: "image" | "audio", localize: Localize): string {
  if (dataUri.length <= MAX_MCP_DATA_URI_BYTES) return dataUri;
  const message = localize({
    "en-US": `The local ${kind} file is too large to inline through MCP in auto mode (limit ~10 MB after base64 encoding). Host it at a public http(s) URL, or switch to a specific --model.`,
    "zh-CN": `本地${kind === "image" ? "图片" : "音频"}文件过大，无法在 auto 模式下通过 MCP 内联发送（base64 编码后上限约 10 MB）。请将其托管为公网 http(s) URL，或切换为具体的 --model。`,
  });
  const hint = localize({
    "en-US":
      "Pass a public http(s) URL instead of a local path, or use --model <id> to switch to the REST path.",
    "zh-CN": "请传入公网 http(s) URL 而非本地路径，或使用 --model <id> 切换回 REST。",
  });
  throw new BailianError(message, ExitCode.USAGE, hint);
}

/**
 * Resolve an `auto`-mode image input: local paths are inlined as base64 data
 * URIs; http(s) URLs and data URIs pass through verbatim.
 */
export function resolveAutoImageInput(source: string, localize: Localize): string {
  if (isUrlScheme(source)) return source;
  return guardDataUriSize(imageFileToDataUri(source), "image", localize);
}

/** Resolve an `auto`-mode audio input the same way (ASR `file_urls`). */
export function resolveAutoAudioInput(source: string, localize: Localize): string {
  if (isUrlScheme(source)) return source;
  return guardDataUriSize(audioFileToDataUri(source), "audio", localize);
}

// ---- Shared-session MCP call wrapper ----

/** A single MCP tool call that returns the parsed inner JSON payload. */
export type AigcMcpCallTool = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * Append a "switch to a specific model" hint to a transport/connect failure,
 * preserving the original message and exit code (AGENTS.md §3 — server errors
 * are passed through verbatim; only internal transport failures get a hint).
 * AUTH/USAGE errors and tool-level errors are re-thrown untouched.
 */
function withAutoModelHint(error: unknown, localize: Localize): never {
  if (
    error instanceof BailianError &&
    !error.hint &&
    (error.exitCode === ExitCode.NETWORK || error.exitCode === ExitCode.GENERAL)
  ) {
    const hint = localize({
      "en-US":
        'MCP generation failed. To use the REST path instead, run with a specific --model <id> (or set a concrete default model instead of "auto").',
      "zh-CN":
        'MCP 生成失败。如需改走 REST，请使用具体的 --model <id>（或将默认模型设为具体值而非 "auto"）。',
    });
    throw new BailianError(error.message, error.exitCode, hint, {
      cause: error,
      api: error.api,
      rawResponse: error.rawResponse,
    });
  }
  throw error;
}

/**
 * Open one MCP session for `serverCode`, run `work` against it, then always
 * close. `connectBailianMcp` returns an already-initialized client, so this
 * does not re-initialize. Concurrent `--concurrent` fan-out shares this single
 * session (the servers are stateless and accept parallel `tools/call`).
 *
 * Every AIGC auto call is attributed with `X-Dashscope-Service: bailian-cli-call`
 * (`MCP_CALL_SERVICE`) so the gateway can separate it from the default channel.
 *
 * Tool-level failures surface through `parseAigcToolResult` (server text passed
 * through verbatim); transport/connect failures get the switch-model hint.
 */
export async function withAigcMcpSession<T>(
  client: Client,
  serverCode: string,
  localize: Localize,
  work: (callTool: AigcMcpCallTool) => Promise<T>,
): Promise<T> {
  let connected: { client: McpConnectedClient; url: string };
  try {
    connected = await client.connectBailianMcp(serverCode, undefined, MCP_CALL_SERVICE);
  } catch (error) {
    throw withAutoModelHint(error, localize);
  }

  const mcpClient = connected.client;
  const callTool: AigcMcpCallTool = async (tool, args) =>
    parseAigcToolResult(await mcpClient.callTool(tool, args));

  try {
    return await work(callTool);
  } finally {
    mcpClient.close?.();
  }
}
