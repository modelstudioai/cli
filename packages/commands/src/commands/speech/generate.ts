import { existsSync, statSync } from "fs";
import { basename, extname, join } from "path";
import { randomBytes } from "crypto";
import {
  audioFileToDataUri,
  BailianError,
  defineCommand,
  ExitCode,
  formatCommand,
  redactDataUri,
  REGIONS,
  resolveOutputDir,
  speechSynthesizePath,
  workspaceMaaSBaseUrl,
  type AudioGenerationReference,
  type AudioGenerationRequest,
  type AudioGenerationResponse,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { downloadFile } from "bailian-cli-runtime";

const DEFAULT_MODEL = "qwen-audio-3.1-tts-next";
const MAX_TEXT_PROMPT_CHARS = 3000;
const MAX_REFERENCES = 3;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
/** Output container formats (includes raw PCM). Reference inputs are stricter. */
const SUPPORTED_FORMATS = new Set(["wav", "mp3", "pcm"]);
/** Reference audio extensions: WAV / MP3 / OGG Opus only (no bare PCM). */
const REFERENCE_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".oga", ".opus"]);
/** Data URI audio subtypes accepted for references (aligned with REFERENCE_AUDIO_EXTENSIONS). */
const REFERENCE_AUDIO_MIME_SUBTYPES = new Set([
  "wav",
  "x-wav",
  "wave",
  "mpeg",
  "mp3",
  "ogg",
  "opus",
]);
const REFERENCE_AUDIO_HINT = "Use WAV, MP3, or OGG Opus reference audio.";
const SUPPORTED_SAMPLE_RATES = new Set([8000, 16000, 24000, 44100, 48000]);
const SUPPORTED_CHANNELS = new Set([1, 2]);
const WORKSPACE_HOST_LABEL = /^[a-zA-Z0-9_-]+$/;

const GENERATE_FLAGS = {
  textPrompt: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Audio generation prompt (up to 3000 characters)",
      "zh-CN": "音频生成提示词（最多 3000 字符）",
    },
    required: true,
  },
  audio: {
    type: "array",
    valueHint: "<url-or-path>",
    description: {
      "en-US":
        "Reference audio URL, local file, or Data URI (repeatable, up to 3; WAV/MP3/OGG Opus only). Referenced in order as @voice1/@voice2/@voice3",
      "zh-CN":
        "参考音频 URL、本地文件或 Data URI（可重复，最多 3 条；仅 WAV/MP3/OGG Opus）。按顺序对应 @voice1/@voice2/@voice3",
    },
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US": `Model id (default: ${DEFAULT_MODEL})`,
      "zh-CN": `模型 ID（默认：${DEFAULT_MODEL}）`,
    },
  },
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID for the default MaaS endpoint (or set BAILIAN_WORKSPACE_ID)",
      "zh-CN": "默认 MaaS Endpoint 使用的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
    },
  },
  format: {
    type: "string",
    valueHint: "<fmt>",
    description: {
      "en-US": "Output format: wav / mp3 / pcm (default: wav)",
      "zh-CN": "输出格式：wav / mp3 / pcm（默认：wav）",
    },
  },
  sampleRate: {
    type: "number",
    valueHint: "<hz>",
    description: {
      "en-US": "Sample rate: 8000 / 16000 / 24000 / 44100 / 48000",
      "zh-CN": "采样率：8000 / 16000 / 24000 / 44100 / 48000",
    },
  },
  channels: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Channels: 1 or 2",
      "zh-CN": "声道数：1 或 2",
    },
  },
  volume: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Volume 0-100 (integer)",
      "zh-CN": "音量 0-100（整数）",
    },
  },
  rate: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Speech rate 0.5-2",
      "zh-CN": "语速 0.5-2",
    },
  },
  seed: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Random seed (integer)",
      "zh-CN": "随机种子（整数）",
    },
  },
  aigcTag: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable AIGC tag (enable_aigc_tag)",
      "zh-CN": "启用 AIGC 标识（enable_aigc_tag）",
    },
  },
  enableCbr: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable MP3 CBR encoding (MP3 only)",
      "zh-CN": "启用 MP3 CBR 编码（仅 MP3）",
    },
  },
  bitRate: {
    type: "number",
    valueHint: "<bps>",
    description: {
      "en-US": "MP3 bit rate when CBR is enabled",
      "zh-CN": "启用 CBR 时的 MP3 码率",
    },
  },
  quality: {
    type: "number",
    valueHint: "<0-9>",
    description: {
      "en-US": "MP3 VBR quality 0-9 (when CBR is off)",
      "zh-CN": "MP3 VBR 质量 0-9（未启用 CBR 时）",
    },
  },
  outDir: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Output directory for the generated audio",
      "zh-CN": "生成音频的输出目录",
    },
  },
  outPrefix: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Filename prefix (basename only; cannot escape the output directory)",
      "zh-CN": "文件名前缀（仅文件名片段；不能跳出输出目录）",
    },
  },
} satisfies FlagsDef;
type GenerateFlags = ParsedFlags<typeof GENERATE_FLAGS>;

function assertSupportedAudioEndpoint(
  endpoint: string,
  localize: (text: { "en-US": string; "zh-CN": string }) => string,
): void {
  let hostname: string;
  try {
    hostname = new URL(endpoint).hostname.toLowerCase();
  } catch {
    throw new BailianError(
      localize({
        "en-US": "Invalid audio generation endpoint.",
        "zh-CN": "音频生成 Endpoint 无效。",
      }),
      ExitCode.USAGE,
    );
  }

  if (hostname === new URL(REGIONS.cn).hostname || hostname === new URL(REGIONS.intl).hostname) {
    return;
  }
  if (/^[a-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(hostname)) {
    return;
  }
  // Custom proxies are allowed; known unsupported official regions are rejected.
  if (
    hostname === new URL(REGIONS.us).hostname ||
    /^[a-z0-9-]+\.us-east-1\.maas\.aliyuncs\.com$/.test(hostname)
  ) {
    throw new BailianError(
      localize({
        "en-US": 'Audio generation is not available in region "us" / us-east-1.',
        "zh-CN": "音频生成在美国地域（us / us-east-1）不可用。",
      }),
      ExitCode.USAGE,
      localize({
        "en-US":
          "Use Beijing or Singapore (cn-beijing / ap-southeast-1), or an explicit supported --base-url.",
        "zh-CN":
          "请使用北京或新加坡（cn-beijing / ap-southeast-1），或显式指定受支持的 --base-url。",
      }),
    );
  }
}

function resolveGenerateEndpoint(ctx: {
  flags: Pick<GenerateFlags, "workspaceId">;
  settings: { workspaceId?: string };
  identity: { binName: string };
  client: { url: (path: string, defaultBaseUrl?: () => string) => string };
  localize: (text: { "en-US": string; "zh-CN": string }) => string;
}): string {
  const endpoint = ctx.client.url(speechSynthesizePath(), () => {
    const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
    if (!workspaceId) {
      throw new BailianError(
        ctx.localize({
          "en-US": "Workspace ID is required for the default audio generation endpoint.",
          "zh-CN": "默认音频生成 Endpoint 需要 Workspace ID。",
        }),
        ExitCode.USAGE,
        ctx.localize({
          "en-US": `Pass --workspace-id, set BAILIAN_WORKSPACE_ID, configure: ${formatCommand(ctx.identity, "config set workspace_id <id>")}, or override with --base-url.`,
          "zh-CN": `请传 --workspace-id、设置 BAILIAN_WORKSPACE_ID、执行 ${formatCommand(ctx.identity, "config set workspace_id <id>")}，或用 --base-url 覆盖。`,
        }),
      );
    }
    if (!WORKSPACE_HOST_LABEL.test(workspaceId)) {
      throw new BailianError(
        ctx.localize({
          "en-US":
            "Workspace ID must contain only letters, digits, hyphens or underscores (no dots, slashes, or ports).",
          "zh-CN": "Workspace ID 只能包含字母、数字、连字符或下划线（不能含点号、斜杠或端口）。",
        }),
        ExitCode.USAGE,
      );
    }
    // Default path only runs when no base URL is configured; always use Beijing MaaS.
    return workspaceMaaSBaseUrl(workspaceId, "cn-beijing");
  });
  assertSupportedAudioEndpoint(endpoint, ctx.localize);
  return endpoint;
}

function assertSupportedReferenceDataUri(dataUri: string): void {
  const mimeMatch = /^data:audio\/([^;,]+)/i.exec(dataUri);
  if (!mimeMatch) {
    throw new BailianError("Reference Data URI must use an audio/* MIME type.", ExitCode.USAGE);
  }
  if (!/;base64,/i.test(dataUri)) {
    throw new BailianError(
      "Reference Data URI must be base64-encoded (…;base64,…).",
      ExitCode.USAGE,
    );
  }
  const subtype = mimeMatch[1]!.toLowerCase();
  if (!REFERENCE_AUDIO_MIME_SUBTYPES.has(subtype)) {
    throw new BailianError(
      `Unsupported reference audio MIME "audio/${subtype}".`,
      ExitCode.USAGE,
      REFERENCE_AUDIO_HINT,
    );
  }
}

function assertSupportedReferenceExtension(filePath: string): void {
  const extension = extname(filePath).toLowerCase() || "unknown";
  if (!REFERENCE_AUDIO_EXTENSIONS.has(extension)) {
    throw new BailianError(
      `Unsupported reference audio format "${extension}".`,
      ExitCode.USAGE,
      REFERENCE_AUDIO_HINT,
    );
  }
}

function buildReference(
  source: string,
  options: { encodeLocal: boolean },
): AudioGenerationReference & { localPath?: string } {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new BailianError("--audio must not be empty.", ExitCode.USAGE);
  }
  if (/^data:/i.test(trimmed)) {
    assertSupportedReferenceDataUri(trimmed);
    return { audio_data: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { audio_url: trimmed };
  }
  if (!existsSync(trimmed)) {
    throw new BailianError(`Audio file not found: ${trimmed}`, ExitCode.USAGE);
  }
  const stat = statSync(trimmed);
  if (!stat.isFile()) {
    throw new BailianError(`Not a file: ${trimmed}`, ExitCode.USAGE);
  }
  if (stat.size > MAX_REFERENCE_BYTES) {
    throw new BailianError(`Reference audio exceeds 10 MB: ${trimmed}`, ExitCode.USAGE);
  }
  assertSupportedReferenceExtension(trimmed);
  if (!options.encodeLocal) {
    return { audio_data: trimmed, localPath: trimmed };
  }
  return { audio_data: audioFileToDataUri(trimmed), localPath: trimmed };
}

function redactReferences(
  references: Array<AudioGenerationReference & { localPath?: string }> | undefined,
): AudioGenerationReference[] | undefined {
  if (!references) return undefined;
  return references.map((reference) => {
    if (reference.audio_url) return { audio_url: reference.audio_url };
    if (reference.localPath && reference.audio_data === reference.localPath) {
      return { audio_data: `<local-file:${reference.localPath};pending-encode>` };
    }
    if (reference.audio_data) return { audio_data: redactDataUri(reference.audio_data) };
    return {};
  });
}

function validateVoiceMentions(textPrompt: string, referenceCount: number): string | undefined {
  const mentions = textPrompt.matchAll(/@voice(\d+)/gi);
  for (const match of mentions) {
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 1 || index > referenceCount) {
      return `Prompt references @voice${index} but only ${referenceCount} --audio reference(s) were provided.`;
    }
  }
  return undefined;
}

function safeOutPrefix(prefix: string | undefined): string {
  if (prefix === undefined || prefix.trim().length === 0) {
    return `audio-gen-${randomBytes(6).toString("hex")}`;
  }
  const base = basename(prefix.trim());
  if (base !== prefix.trim() || base.includes("..") || base.includes("/") || base.includes("\\")) {
    throw new BailianError(
      "--out-prefix must be a filename fragment without directory separators.",
      ExitCode.USAGE,
    );
  }
  return base;
}

export default defineCommand({
  description: {
    "en-US": "Generate podcast/dialogue audio content from a text prompt",
    "zh-CN": "根据文本提示生成播客/对白等音频内容",
  },
  auth: "apiKey",
  usageArgs: "--text-prompt <text> [--audio <url-or-path>] [flags]",
  flags: GENERATE_FLAGS,
  notes: [
    {
      "en-US":
        "Unlike `speech synthesize`, this command uses text_prompt/references and does not accept system or cloned voice IDs.",
      "zh-CN":
        "与 `speech synthesize` 不同，本命令使用 text_prompt/references，不接受系统音色或复刻 voice ID。",
    },
    {
      "en-US":
        "Default endpoint is Beijing MaaS and needs a workspace ID. For Singapore or other hosts, set --base-url / DASHSCOPE_BASE_URL / Profile base_url explicitly (for example https://<ws>.ap-southeast-1.maas.aliyuncs.com); that override does not require workspace.",
      "zh-CN":
        "默认 Endpoint 为北京 MaaS，需要 Workspace ID。新加坡或其他 Endpoint 请通过 --base-url / DASHSCOPE_BASE_URL / Profile base_url 显式指定（例如 https://<ws>.ap-southeast-1.maas.aliyuncs.com）；显式覆盖时不必提供 workspace。",
    },
  ],
  exampleArgs: [
    {
      "en-US":
        '--workspace-id <id> --text-prompt "Generate a short podcast about city nightscapes." --dry-run --output json',
      "zh-CN":
        '--workspace-id <id> --text-prompt "生成两位主持人讨论城市夜景的短播客。" --dry-run --output json',
    },
    {
      "en-US":
        '--workspace-id <id> --text-prompt "Introduce today\'s weather with @voice1." --audio ./reference.wav --out-dir ./audio',
      "zh-CN":
        '--workspace-id <id> --text-prompt "用 @voice1 的声音介绍今天的天气。" --audio ./reference.wav --out-dir ./audio',
    },
  ],
  validate: (flags: GenerateFlags) => {
    const textPrompt = flags.textPrompt.trim();
    if (textPrompt.length === 0) return "--text-prompt must not be empty.";
    if (textPrompt.length > MAX_TEXT_PROMPT_CHARS) {
      return `--text-prompt must be at most ${MAX_TEXT_PROMPT_CHARS} characters.`;
    }
    if (flags.audio !== undefined && flags.audio.length > MAX_REFERENCES) {
      return `Provide at most ${MAX_REFERENCES} --audio references.`;
    }
    const referenceCount = flags.audio?.length ?? 0;
    const mentionError = validateVoiceMentions(textPrompt, referenceCount);
    if (mentionError) return mentionError;

    if (flags.format !== undefined && !SUPPORTED_FORMATS.has(flags.format)) {
      return "--format must be wav, mp3, or pcm.";
    }
    if (flags.sampleRate !== undefined && !SUPPORTED_SAMPLE_RATES.has(flags.sampleRate)) {
      return "--sample-rate must be 8000, 16000, 24000, 44100, or 48000.";
    }
    if (flags.channels !== undefined && !SUPPORTED_CHANNELS.has(flags.channels)) {
      return "--channels must be 1 or 2.";
    }
    if (
      flags.volume !== undefined &&
      (!Number.isInteger(flags.volume) || flags.volume < 0 || flags.volume > 100)
    ) {
      return "--volume must be an integer between 0 and 100.";
    }
    if (flags.rate !== undefined && (flags.rate < 0.5 || flags.rate > 2)) {
      return "--rate must be between 0.5 and 2.";
    }
    if (flags.seed !== undefined && !Number.isInteger(flags.seed)) {
      return "--seed must be an integer.";
    }
    if (
      flags.quality !== undefined &&
      (!Number.isInteger(flags.quality) || flags.quality < 0 || flags.quality > 9)
    ) {
      return "--quality must be an integer between 0 and 9.";
    }
    const format = flags.format ?? "wav";
    if (flags.enableCbr !== undefined && format !== "mp3") {
      return "--enable-cbr is only valid with --format mp3.";
    }
    if (flags.bitRate !== undefined && (format !== "mp3" || flags.enableCbr !== true)) {
      return "--bit-rate requires --format mp3 and --enable-cbr true.";
    }
    if (flags.quality !== undefined && (format !== "mp3" || flags.enableCbr === true)) {
      return "--quality requires --format mp3 without CBR (--enable-cbr false or omitted).";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const textPrompt = flags.textPrompt.trim();
    const model = flags.model || DEFAULT_MODEL;
    const format = (flags.format ?? "wav") as "wav" | "mp3" | "pcm";
    const dryRun = settings.dryRun === true;

    const endpoint = resolveGenerateEndpoint(ctx);

    const rawAudios = flags.audio ?? [];
    const references = rawAudios.map((source) => buildReference(source, { encodeLocal: !dryRun }));

    const input: AudioGenerationRequest["input"] = {
      text_prompt: textPrompt,
    };
    if (references.length > 0) {
      input.references = references.map((reference) => {
        const entry: AudioGenerationReference = {};
        if (reference.audio_url !== undefined) entry.audio_url = reference.audio_url;
        if (reference.audio_data !== undefined) entry.audio_data = reference.audio_data;
        return entry;
      });
    }
    input.format = format;
    if (flags.sampleRate !== undefined) input.sample_rate = flags.sampleRate;
    if (flags.channels !== undefined) input.channels = flags.channels;
    if (flags.volume !== undefined) input.volume = flags.volume;
    if (flags.rate !== undefined) input.rate = flags.rate;
    if (flags.seed !== undefined) input.seed = flags.seed;
    if (flags.aigcTag !== undefined) input.enable_aigc_tag = flags.aigcTag;
    if (flags.enableCbr !== undefined) input.enable_cbr = flags.enableCbr;
    if (flags.bitRate !== undefined) input.bit_rate = flags.bitRate;
    if (flags.quality !== undefined) input.quality = flags.quality;

    const request: AudioGenerationRequest = { model, input };

    // Validate destination naming before POST so bad --out-prefix never burns a generation.
    const prefix = safeOutPrefix(flags.outPrefix);

    if (dryRun) {
      const dryInput =
        input.references !== undefined
          ? { ...input, references: redactReferences(references) }
          : input;
      ctx.output.result({
        endpoint,
        request: { model, input: dryInput },
      });
      return;
    }

    const destDir = resolveOutputDir(settings, {
      flagDir: flags.outDir,
      subDir: flags.outDir ? undefined : "speech",
    });
    const destPath = join(destDir, `${prefix}.${format}`);

    const response = await ctx.client.requestJson<AudioGenerationResponse>({
      path: endpoint,
      method: "POST",
      body: request,
    });

    const audioUrl = response.output?.audio?.url?.trim();
    if (!audioUrl) {
      throw new BailianError(
        ctx.localize({
          "en-US": "Audio generation response did not include output.audio.url.",
          "zh-CN": "音频生成响应未包含 output.audio.url。",
        }),
        ExitCode.GENERAL,
        ctx.localize({
          "en-US":
            "This mode returns a download URL (audio.data is empty). Do not retry automatically.",
          "zh-CN": "此模式返回下载 URL（audio.data 为空）。请勿自动重试。",
        }),
      );
    }

    await downloadFile(audioUrl, destPath, {
      quiet: settings.quiet || settings.output === "json",
    });

    const result = {
      ...response,
      model,
      url: audioUrl,
      saved: destPath,
    };

    let text: string | undefined;
    if (settings.output === "text") {
      const duration = response.output?.audio?.duration;
      const lines = [
        `model: ${model}`,
        `saved: ${destPath}`,
        `format: ${format}`,
        flags.sampleRate !== undefined ? `sample_rate: ${flags.sampleRate}` : undefined,
        flags.channels !== undefined ? `channels: ${flags.channels}` : undefined,
        duration !== undefined ? `duration: ${duration}` : undefined,
        response.request_id ? `request_id: ${response.request_id}` : undefined,
      ];
      text = lines.filter((line): line is string => line !== undefined).join("\n");
    }
    ctx.output.result(result, { text });
  },
});
