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
  isMcpTtsVoice,
  MCP_TTS_VOICES,
  MCP_CALL_SERVICE,
  resolveMcpImageSize,
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

// ---- Connection applicability gate ----

/**
 * Reject `auto` mode up front when the effective connection cannot reach the
 * Bailian AIGC MCP servers. Both Token Plan shapes were verified against the
 * live gateways: the token-plan endpoint has no `/api/v1/mcps` route at all
 * (bare 404, empty body) and plan keys (`sk-sp-`) are refused on the standard
 * MCP path (401 InvalidApiKey). Neither server response is self-explanatory,
 * and this applicability fact is authoritative on the client side, so it is
 * raised before any request instead of passing the opaque error through.
 */
export function assertAutoMcpAvailable(client: Client, localize: Localize): void {
  if (!client.usesTokenPlanConnection()) return;
  const message = localize({
    "en-US":
      "The current model (auto) routes generation through Bailian MCP, which the Token Plan connection (endpoint or API key) does not provide.",
    "zh-CN": "当前模型（auto）经百炼 MCP 路由生成，Token Plan 连接（端点或 API Key）不提供该能力。",
  });
  const hint = localize({
    "en-US":
      "Switch to a config profile with a standard DashScope API key, or pass --model <id> to keep using Token Plan models.",
    "zh-CN":
      "请切换到含标准 DashScope API Key 的配置，或传入 --model <id> 继续使用 Token Plan 模型。",
  });
  throw new BailianError(message, ExitCode.USAGE, hint);
}

// ---- MCP input value gates (auto mode) ----

/**
 * Resolve an `auto`-mode `--size` for MCP image generation: ratios map to the
 * server's pixel presets and pixel input passes through; values MCP cannot
 * accept are rejected up front with the unsupported-parameter USAGE error.
 */
export function resolveAutoImageSize(
  size: string | undefined,
  localize: Localize,
): string | undefined {
  if (size === undefined) return undefined;
  const mapped = resolveMcpImageSize(size);
  if (mapped === undefined) {
    throw mcpUnsupportedError(localize, [`--size ${size}`]);
  }
  return mapped;
}

/**
 * Reject `auto`-mode TTS voices outside the MCP enum before any request: REST
 * voice IDs (e.g. `longxiaochun_v3`) are not accepted by `bailian_tts`.
 */
export function assertMcpTtsVoice(voice: string, localize: Localize): void {
  if (isMcpTtsVoice(voice)) return;
  const list = MCP_TTS_VOICES.join(", ");
  const message = localize({
    "en-US": `The current model (auto) does not support voice "${voice}". MCP TTS voices: ${list}.`,
    "zh-CN": `当前模型（auto）不支持音色 "${voice}"。MCP 可选音色：${list}。`,
  });
  const hint = localize({
    "en-US": "Pass one of the listed MCP voices, or use --model <id> for the REST system voices.",
    "zh-CN": "请传入所列 MCP 音色，或使用 --model <id> 改用 REST 系统音色。",
  });
  throw new BailianError(message, ExitCode.USAGE, hint);
}

// ---- Local file input (auto mode inlines files as base64 data URIs) ----

/** True for inputs already carrying a URL / inline scheme (not a local path). */
function isUrlScheme(source: string): boolean {
  return /^(https?|oss|data):/i.test(source);
}

/**
 * Resolve an `auto`-mode image input: local paths are inlined as base64 data
 * URIs; http(s) URLs and data URIs pass through verbatim.
 *
 * Files are inlined rather than uploaded because the AIGC MCP servers reject
 * `oss://` and cannot fetch private upload URLs. The inline payload is
 * deliberately not capped on this side: how large a data URI is acceptable is
 * the server's own contract, so an oversized one surfaces as a server error
 * passed through verbatim (AGENTS.md §3) instead of a client-side guess.
 */
export function resolveAutoImageInput(source: string): string {
  if (isUrlScheme(source)) return source;
  return imageFileToDataUri(source);
}

/** Resolve an `auto`-mode audio input the same way (ASR `file_urls`). */
export function resolveAutoAudioInput(source: string): string {
  if (isUrlScheme(source)) return source;
  return audioFileToDataUri(source);
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
        "The current model (auto) failed to generate. Retry with a specific --model <id> (or set a concrete default model).",
      "zh-CN":
        "当前模型（auto）生成失败，请使用具体的 --model <id>（或将默认模型设为具体值）进行重试。",
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
