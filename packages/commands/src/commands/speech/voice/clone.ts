import {
  BailianError,
  buildOmniVoiceRequest,
  buildVoiceRequest,
  defineCommand,
  ExitCode,
  isCliOmniVoiceCloneTarget,
  isOmniRealtimeTargetModel,
  isOmniVoiceTargetModel,
  omniVoiceCliCloneTargetsHint,
  postVoiceRequest,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type OmniVoiceCreateOutput,
  type OmniVoiceCloneMode,
  type ParsedFlags,
  type VoiceCreateOutput,
} from "bailian-cli-core";
import {
  redactOmniVoiceAudioInRequest,
  redactVoiceAudioInRequest,
  resolveVoiceAudioSource,
  validateLanguageHints,
  validateOmniPreferredName,
  validateOmniVoiceCloneMode,
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
    description: {
      "en-US":
        "Name prefix (CosyVoice/Qwen-Audio: 1-10 alnum → prefix) or Omni preferred_name (1-16 alnum/underscore)",
      "zh-CN":
        "名称前缀（CosyVoice/Qwen-Audio：1-10 字母数字 → prefix；Omni：1-16 字母数字/下划线 → preferred_name）",
    },
    required: true,
  },
  targetModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "Target model for this voice (required). CosyVoice/Qwen-Audio → later `speech synthesize --model`; Omni CLI clone → qwen3.5-omni-flash/plus then `omni --model <same-target-model> --voice <id>` (Realtime targets rejected)",
      "zh-CN":
        "该音色绑定的目标模型（必填）。CosyVoice/Qwen-Audio → 后续 `speech synthesize --model`；Omni CLI 复刻 → qwen3.5-omni-flash/plus 后用 `omni --model <同一 target-model> --voice <id>`（拒绝 Realtime 目标）",
    },
    required: true,
  },
  languageHint: {
    type: "array",
    valueHint: "<code>",
    description: {
      "en-US":
        "Language hint (at most one). CosyVoice/Qwen-Audio → language_hints[]; Omni → language",
      "zh-CN":
        "参考音频语言提示（最多一项）。CosyVoice/Qwen-Audio → language_hints[]；Omni → language",
    },
  },
  volumeNormalize: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": 'Enable volume normalization (CosyVoice/Qwen-Audio; sent as string "true"/"false")',
      "zh-CN": '启用音量归一化（仅 CosyVoice/Qwen-Audio；以字符串 "true"/"false" 下发）',
    },
  },
  maxPromptAudioLength: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Max prompt audio length in seconds (3-30; CosyVoice/Qwen-Audio only)",
      "zh-CN": "参考音频最大时长（秒，范围 3-30；仅 CosyVoice/Qwen-Audio）",
    },
  },
  preprocess: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable audio preprocess (enable_preprocess; CosyVoice/Qwen-Audio only)",
      "zh-CN": "启用音频预处理（enable_preprocess；仅 CosyVoice/Qwen-Audio）",
    },
  },
  text: {
    type: "string",
    valueHint: "<transcript>",
    description: {
      "en-US": "Transcript matching the reference audio (Omni only; optional)",
      "zh-CN": "与参考音频匹配的文本（仅 Omni；可选）",
    },
  },
  voiceCloneMode: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US":
        "Omni voice_clone_mode: normal | dialect | crosslingual (optional for CLI-supported qwen3.5-omni-flash/plus)",
      "zh-CN":
        "Omni voice_clone_mode：normal | dialect | crosslingual（CLI 支持的 qwen3.5-omni-flash/plus 可选）",
    },
  },
  skipAudioProcess: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Skip Omni audio preprocess (parameters.skip_audio_process; default false)",
      "zh-CN": "跳过 Omni 音频预处理（parameters.skip_audio_process；默认 false）",
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
        "CosyVoice/Qwen-Audio use model voice-enrollment (create_voice → voice_id). Review status DEPLOYING/OK/UNDEPLOYED — use `speech voice get` / `preview`.",
      "zh-CN":
        "CosyVoice/Qwen-Audio 使用 model=voice-enrollment（create_voice → voice_id）。审核状态 DEPLOYING/OK/UNDEPLOYED — 用 `speech voice get` / `preview`。",
    },
    {
      "en-US":
        "CLI Omni clone only supports non-realtime targets qwen3.5-omni-flash/plus (dated suffixes allowed) via qwen-voice-enrollment → output.voice → `omni --model <same-target-model> --voice <id>` (must match create --target-model; omitting --model is rejected with exit 2 when it would auto-switch qwen3.8-omni-flash to plus). Realtime (*-realtime) enrollment is rejected here (no Realtime command in this CLI). No get/update/preview/design for Omni.",
      "zh-CN":
        "CLI Omni 复刻仅支持非 realtime 目标 qwen3.5-omni-flash/plus（允许日期后缀），协议 qwen-voice-enrollment → output.voice → `omni --model <同一 target-model> --voice <id>`（必须与创建时 --target-model 一致；若省略 --model 会从 qwen3.8-omni-flash 自动切到 plus，则以退出码 2 拒绝）。拒绝 *-realtime（本 CLI 无 Realtime 命令）。Omni 无 get/update/preview/design。",
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
    {
      "en-US":
        "--audio ./reference.wav --prefix guanyu --target-model qwen3.5-omni-flash --language-hint zh --dry-run --output json",
      "zh-CN":
        "--audio ./reference.wav --prefix guanyu --target-model qwen3.5-omni-flash --language-hint zh --dry-run --output json",
    },
  ],
  validate: (flags: CloneFlags) => {
    const targetModel = flags.targetModel;
    const omniLooking = isOmniVoiceTargetModel(targetModel);
    const cliTargets = omniVoiceCliCloneTargetsHint();

    if (omniLooking && isOmniRealtimeTargetModel(targetModel)) {
      return {
        "en-US": `--target-model "${targetModel}" is a Realtime Omni model. This CLI has no Omni Realtime command, so Realtime voice enrollment is not supported. Clone with a non-realtime target instead: ${cliTargets}.`,
        "zh-CN": `--target-model "${targetModel}" 是 Realtime Omni 模型。本 CLI 没有 Omni Realtime 命令，因此不支持 Realtime 音色复刻。请改用非 realtime 目标：${cliTargets}。`,
      };
    }

    if (omniLooking && !isCliOmniVoiceCloneTarget(targetModel)) {
      return {
        "en-US": `--target-model "${targetModel}" is not a CLI-supported Omni clone target. Use one of: ${cliTargets} (dated suffixes like -2025-06-15 allowed). Note: qwen3.8-omni-flash is the CLI omni text default and cannot enroll a voice.`,
        "zh-CN": `--target-model "${targetModel}" 不是本 CLI 支持的 Omni 复刻目标。请使用：${cliTargets}（允许 -2025-06-15 这类日期后缀）。注意：qwen3.8-omni-flash 是 CLI omni 文本默认模型，不能用于复刻音色。`,
      };
    }

    if (omniLooking) {
      const preferredError = validateOmniPreferredName(flags.prefix);
      if (preferredError) return preferredError;
      if (
        flags.volumeNormalize !== undefined ||
        flags.maxPromptAudioLength !== undefined ||
        flags.preprocess !== undefined
      ) {
        return {
          "en-US":
            "--volume-normalize / --max-prompt-audio-length / --preprocess apply only to CosyVoice/Qwen-Audio enrollment.",
          "zh-CN":
            "--volume-normalize / --max-prompt-audio-length / --preprocess 仅适用于 CosyVoice/Qwen-Audio 复刻。",
        };
      }
      const modeError = validateOmniVoiceCloneMode(flags.voiceCloneMode);
      if (modeError) return modeError;
    } else {
      const prefixError = validateVoicePrefix(flags.prefix);
      if (prefixError) return prefixError;
      if (
        flags.text !== undefined ||
        flags.voiceCloneMode !== undefined ||
        flags.skipAudioProcess !== undefined
      ) {
        return {
          "en-US":
            "--text / --voice-clone-mode / --skip-audio-process apply only to Omni (qwen-voice-enrollment) targets.",
          "zh-CN":
            "--text / --voice-clone-mode / --skip-audio-process 仅适用于 Omni（qwen-voice-enrollment）目标模型。",
        };
      }
      if (
        flags.maxPromptAudioLength !== undefined &&
        (flags.maxPromptAudioLength < 3 || flags.maxPromptAudioLength > 30)
      ) {
        return "--max-prompt-audio-length must be between 3 and 30.";
      }
    }

    const hintError = validateLanguageHints(flags.languageHint);
    if (hintError) return hintError;
    if (flags.text !== undefined && flags.text.trim().length === 0) {
      return "--text must not be empty when provided.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const prefix = flags.prefix as string;
    const targetModel = flags.targetModel as string;
    const dryRun = settings.dryRun === true;
    const resolved = resolveVoiceAudioSource(flags.audio, { encodeLocal: !dryRun });

    if (isCliOmniVoiceCloneTarget(targetModel)) {
      const input: Record<string, unknown> = {
        target_model: targetModel,
        preferred_name: prefix,
        audio: { data: resolved.audio },
      };
      if (flags.languageHint !== undefined && flags.languageHint.length > 0) {
        input.language = flags.languageHint[0]!.trim();
      }
      if (flags.text !== undefined) {
        input.text = flags.text.trim();
      }

      const parameters: Record<string, unknown> = {};
      if (flags.voiceCloneMode !== undefined) {
        parameters.voice_clone_mode = flags.voiceCloneMode as OmniVoiceCloneMode;
      }
      if (flags.skipAudioProcess !== undefined) {
        parameters.skip_audio_process = flags.skipAudioProcess;
      }

      const request = buildOmniVoiceRequest(
        "create",
        input,
        Object.keys(parameters).length > 0 ? parameters : undefined,
      );

      if (dryRun) {
        ctx.output.result({
          endpoint: ctx.client.url(speechVoiceCustomizationPath()),
          request: redactOmniVoiceAudioInRequest(request, resolved.localPath),
        });
        return;
      }

      const response = await postVoiceRequest<OmniVoiceCreateOutput>(ctx.client, request);
      const voice = response.output?.voice;
      if (!voice) {
        throw new BailianError(
          ctx.localize({
            "en-US": "Omni voice enrollment succeeded but output.voice is missing.",
            "zh-CN": "Omni 音色复刻成功但缺少 output.voice。",
          }),
          ExitCode.GENERAL,
        );
      }
      ctx.output.result(response, {
        text: settings.output === "text" ? voice : undefined,
      });
      return;
    }

    const input: Record<string, unknown> = {
      target_model: targetModel,
      prefix,
      audio: resolved.audio,
    };
    if (flags.languageHint !== undefined && flags.languageHint.length > 0) {
      input.language_hints = [flags.languageHint[0]!.trim()];
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
