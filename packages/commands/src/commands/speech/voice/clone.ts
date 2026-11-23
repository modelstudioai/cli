import {
  buildVoiceRequest,
  defineCommand,
  postVoiceRequest,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
  type VoiceCreateOutput,
} from "bailian-cli-core";
import {
  redactVoiceAudioInRequest,
  resolveVoiceAudioSource,
  validateLanguageHints,
  validateVoicePrefix,
  VOICE_PREFIX_FLAG,
  VOICE_RIGHTS_NOTES,
} from "./shared.ts";

const CLONE_FLAGS = {
  audio: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Reference audio URL or local file",
      "zh-CN": "参考音频 URL 或本地文件",
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
      "en-US": "Language hint for the reference audio (at most one; mapped to language_hints)",
      "zh-CN": "参考音频语言提示（最多一项；映射为 language_hints）",
    },
  },
  volumeNormalize: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": 'Enable volume normalization (sent as string "true"/"false")',
      "zh-CN": '启用音量归一化（以字符串 "true"/"false" 下发）',
    },
  },
  maxPromptAudioLength: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Max prompt audio length in seconds (3-30)",
      "zh-CN": "参考音频最大时长（秒，范围 3-30）",
    },
  },
  preprocess: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable audio preprocess (enable_preprocess)",
      "zh-CN": "启用音频预处理（enable_preprocess）",
    },
  },
} satisfies FlagsDef;
type CloneFlags = ParsedFlags<typeof CLONE_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Clone a custom voice from reference audio",
    "zh-CN": "从参考音频复刻自定义音色",
  },
  auth: "apiKey",
  usageArgs: "--audio <url-or-path> --prefix <text> --target-model <model> [flags]",
  flags: CLONE_FLAGS,
  notes: [
    ...VOICE_RIGHTS_NOTES,
    {
      "en-US":
        "Creation returns voice_id immediately. Review status is DEPLOYING/OK/UNDEPLOYED — use `speech voice get` to check; preview reference audio with `speech voice preview`.",
      "zh-CN":
        "创建会立即返回 voice_id。审核状态为 DEPLOYING/OK/UNDEPLOYED — 用 `speech voice get` 查询；用 `speech voice preview` 获取参考音频。",
    },
  ],
  exampleArgs: [
    {
      "en-US":
        "--audio ./reference.wav --prefix demo --target-model cosyvoice-v3-flash --dry-run --output json",
      "zh-CN":
        "--audio ./reference.wav --prefix demo --target-model cosyvoice-v3-flash --dry-run --output json",
    },
    {
      "en-US":
        "--audio https://example.com/ref.wav --prefix Demo01 --target-model cosyvoice-v3-flash --language-hint zh",
      "zh-CN":
        "--audio https://example.com/ref.wav --prefix Demo01 --target-model cosyvoice-v3-flash --language-hint zh",
    },
  ],
  validate: (flags: CloneFlags) => {
    const prefixError = validateVoicePrefix(flags.prefix);
    if (prefixError) return prefixError;
    const hintError = validateLanguageHints(flags.languageHint);
    if (hintError) return hintError;
    if (
      flags.maxPromptAudioLength !== undefined &&
      (flags.maxPromptAudioLength < 3 || flags.maxPromptAudioLength > 30)
    ) {
      return "--max-prompt-audio-length must be between 3 and 30.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const prefix = flags.prefix as string;

    const dryRun = settings.dryRun === true;
    const resolved = resolveVoiceAudioSource(flags.audio, { encodeLocal: !dryRun });

    const input: Record<string, unknown> = {
      target_model: flags.targetModel,
      prefix,
      audio: resolved.audio,
    };
    if (flags.languageHint !== undefined && flags.languageHint.length > 0) {
      input.language_hints = [flags.languageHint[0]!];
    }
    if (flags.volumeNormalize !== undefined) {
      input.enable_volume_normalization = flags.volumeNormalize ? "true" : "false";
    }
    if (flags.maxPromptAudioLength !== undefined) {
      input.max_prompt_audio_length = flags.maxPromptAudioLength;
    }
    if (flags.preprocess !== undefined) {
      input.enable_preprocess = flags.preprocess;
    }

    const request = buildVoiceRequest("create_voice", input);

    if (dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVoiceCustomizationPath()),
        request: redactVoiceAudioInRequest(request, resolved.localPath),
      });
      return;
    }

    const response = await postVoiceRequest<VoiceCreateOutput>(ctx.client, request);

    ctx.output.result(response, {
      text: settings.output === "text" ? (response.output?.voice_id ?? "") : undefined,
    });
  },
});
