import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import {
  BailianError,
  buildVoiceRequest,
  createDesignVoice,
  defineCommand,
  ExitCode,
  resolveOutputDir,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import {
  validateLanguageHints,
  validateVoicePrefix,
  VOICE_PREFIX_FLAG,
  VOICE_RIGHTS_NOTES,
} from "./shared.ts";

const DESIGN_SAMPLE_RATES = new Set([16000, 24000, 48000]);
const DESIGN_FORMATS = new Set(["pcm", "wav", "mp3"]);

const DESIGN_FLAGS = {
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Voice description (up to 500 characters)",
      "zh-CN": "音色描述（最多 500 字符）",
    },
    required: true,
  },
  previewText: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Preview text spoken in the design sample (15-200 characters)",
      "zh-CN": "设计预览朗读文本（15-200 字符）",
    },
    required: true,
  },
  prefix: {
    ...VOICE_PREFIX_FLAG.prefix,
    required: true,
  },
  targetModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "Target TTS model for this voice (required). Must match later `speech synthesize --model`",
      "zh-CN": "该音色绑定的目标 TTS 模型（必填）。必须与后续 `speech synthesize --model` 一致",
    },
    required: true,
  },
  languageHint: {
    type: "array",
    valueHint: "<code>",
    description: {
      "en-US": "Language hint (zh/en; at most one; server default: zh)",
      "zh-CN": "语言提示（zh/en；最多一项；服务端默认 zh）",
    },
  },
  sampleRate: {
    type: "number",
    valueHint: "<hz>",
    description: {
      "en-US": "Preview sample rate: 16000 / 24000 / 48000 (server default: 24000)",
      "zh-CN": "预览采样率：16000 / 24000 / 48000（服务端默认 24000）",
    },
  },
  format: {
    type: "string",
    valueHint: "<fmt>",
    description: {
      "en-US": "Preview format: pcm / wav / mp3 (server default: wav)",
      "zh-CN": "预览格式：pcm / wav / mp3（服务端默认 wav）",
    },
  },
  out: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Local path for the preview audio (optional; defaults under the audio output dir)",
      "zh-CN": "预览音频本地路径（可选；默认写入音频输出目录）",
    },
  },
} satisfies FlagsDef;
type DesignFlags = ParsedFlags<typeof DESIGN_FLAGS>;

function extensionForFormat(format: string | undefined): string {
  if (format === "mp3") return "mp3";
  if (format === "pcm") return "pcm";
  return "wav";
}

export default defineCommand({
  description: {
    "en-US": "Design a custom voice from a text description",
    "zh-CN": "用文字描述设计自定义音色",
  },
  auth: "apiKey",
  usageArgs: "--prompt <text> --preview-text <text> --prefix <text> --target-model <model> [flags]",
  flags: DESIGN_FLAGS,
  notes: [
    ...VOICE_RIGHTS_NOTES,
    {
      "en-US":
        "The response includes a one-shot preview_audio (Base64). Querying the voice later may not return preview_audio again. Formal listen tests use `speech synthesize`.",
      "zh-CN":
        "响应含一次性 preview_audio（Base64）。之后查询音色不一定再次返回预览。正式试听请用 `speech synthesize`。",
    },
  ],
  exampleArgs: [
    {
      "en-US":
        '--prompt "Calm warm Chinese announcer" --preview-text "Welcome to today\'s program." --prefix demo --target-model cosyvoice-v3.5-plus --dry-run --output json',
      "zh-CN":
        '--prompt "沉稳温暖的中文播音员" --preview-text "各位听众朋友们大家好，欢迎收听今天的节目。" --prefix demo --target-model cosyvoice-v3.5-plus --dry-run --output json',
    },
  ],
  validate: (flags: DesignFlags) => {
    const prefixError = validateVoicePrefix(flags.prefix);
    if (prefixError) return prefixError;

    const prompt = flags.prompt.trim();
    if (prompt.length === 0) return "--prompt must not be empty.";
    if (prompt.length > 500) return "--prompt must be at most 500 characters.";

    const previewText = flags.previewText.trim();
    if (previewText.length === 0) return "--preview-text must not be empty.";
    if (previewText.length < 15 || previewText.length > 200) {
      return "--preview-text must be between 15 and 200 characters.";
    }

    const hintError = validateLanguageHints(flags.languageHint);
    if (hintError) return hintError;
    if (flags.languageHint !== undefined && flags.languageHint.length === 1) {
      const code = flags.languageHint[0]!.trim();
      if (code !== "zh" && code !== "en") {
        return "--language-hint must be zh or en.";
      }
    }

    if (flags.sampleRate !== undefined && !DESIGN_SAMPLE_RATES.has(flags.sampleRate)) {
      return "--sample-rate must be 16000, 24000, or 48000.";
    }
    if (flags.format !== undefined && !DESIGN_FORMATS.has(flags.format)) {
      return "--format must be pcm, wav, or mp3.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const prefix = flags.prefix as string;
    const voicePrompt = flags.prompt.trim();
    const previewText = flags.previewText.trim();

    const input: Record<string, unknown> = {
      target_model: flags.targetModel,
      prefix,
      voice_prompt: voicePrompt,
      preview_text: previewText,
    };
    if (flags.languageHint !== undefined && flags.languageHint.length > 0) {
      input.language_hints = [flags.languageHint[0]!.trim()];
    }

    const parameters: Record<string, unknown> = {};
    if (flags.sampleRate !== undefined) parameters.sample_rate = flags.sampleRate;
    if (flags.format !== undefined) parameters.response_format = flags.format;

    const request = buildVoiceRequest(
      "create_voice",
      input,
      Object.keys(parameters).length > 0 ? parameters : undefined,
    );

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVoiceCustomizationPath()),
        request,
      });
      return;
    }

    const response = await createDesignVoice(
      ctx.client,
      {
        target_model: flags.targetModel,
        prefix,
        voice_prompt: voicePrompt,
        preview_text: previewText,
        language_hints:
          flags.languageHint !== undefined && flags.languageHint.length > 0
            ? [flags.languageHint[0]!.trim()]
            : undefined,
      },
      {
        sample_rate: flags.sampleRate,
        response_format: flags.format,
      },
    );

    const voiceId = response.output?.voice_id;
    const previewAudio = response.output?.preview_audio;
    const audioData = previewAudio?.data?.trim();
    if (!audioData) {
      throw new BailianError(
        ctx.localize({
          "en-US": "Design response did not include preview audio data.",
          "zh-CN": "设计响应未包含预览音频数据。",
        }),
        ExitCode.GENERAL,
        ctx.localize({
          "en-US": voiceId
            ? `Voice was created as ${voiceId}. Use get/list/delete to inspect or clean up; do not retry create automatically.`
            : "No voice_id was returned either. Inspect the raw response with --output json if available.",
          "zh-CN": voiceId
            ? `音色已创建：${voiceId}。请用 get/list/delete 查询或清理；不要自动重试创建。`
            : "也未返回 voice_id。如有原始响应可用 --output json 排查。",
        }),
      );
    }

    const responseFormat = previewAudio?.response_format ?? flags.format ?? "wav";
    const extension = extensionForFormat(responseFormat);
    let destPath: string;
    try {
      destPath =
        flags.out ??
        join(
          resolveOutputDir(settings, { subDir: "speech" }),
          `voice-design-${randomBytes(6).toString("hex")}.${extension}`,
        );
      if (flags.out) {
        mkdirSync(dirname(destPath), { recursive: true });
      }
      writeFileSync(destPath, Buffer.from(audioData, "base64"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BailianError(
        ctx.localize({
          "en-US": `Failed to save preview audio: ${message}`,
          "zh-CN": `保存预览音频失败：${message}`,
        }),
        ExitCode.GENERAL,
        ctx.localize({
          "en-US": voiceId
            ? `Voice was created as ${voiceId}. Fix the output path and use get/delete — do not recreate.`
            : "Fix the output path before retrying.",
          "zh-CN": voiceId
            ? `音色已创建：${voiceId}。请修正输出路径后用 get/delete 处理，不要重新创建。`
            : "请先修正输出路径再重试。",
        }),
      );
    }

    // Omit preview bytes from JSON after save (same pattern as synthesize / omni).
    const result = {
      ...response,
      output: response.output
        ? {
            ...response.output,
            preview_audio: previewAudio ? { ...previewAudio, data: "<omitted>" } : previewAudio,
          }
        : response.output,
      saved: destPath,
    };

    let text: string | undefined;
    if (settings.output === "text") {
      const sampleRate = previewAudio?.sample_rate ?? flags.sampleRate ?? "";
      text = [
        `voice_id: ${voiceId ?? ""}`,
        `target_model: ${response.output?.target_model ?? flags.targetModel}`,
        `format: ${responseFormat}`,
        `sample_rate: ${sampleRate}`,
        `saved: ${destPath}`,
        response.request_id ? `request_id: ${response.request_id}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n");
    }
    ctx.output.result(result, { text });
  },
});
