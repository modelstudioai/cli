import {
  buildVoiceRequest,
  defineCommand,
  speechVoiceCustomizationPath,
  updateVoice,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import {
  isOmniManagedVoiceId,
  OMNI_VOICE_UNSUPPORTED_OP,
  redactVoiceAudioInRequest,
  resolveVoiceAudioSource,
  validateVoiceId,
  VOICE_ID_FLAG,
  VOICE_RIGHTS_NOTES,
} from "./shared.ts";

const UPDATE_FLAGS = {
  ...VOICE_ID_FLAG,
  audio: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "New reference audio URL or local file",
      "zh-CN": "新的参考音频 URL 或本地文件",
    },
    required: true,
  },
} satisfies FlagsDef;
type UpdateFlags = ParsedFlags<typeof UPDATE_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Update the reference audio of a cloned voice",
    "zh-CN": "更新复刻音色的参考音频",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This updates the reference audio for the voice ID. All synthesis that uses this voice will be affected.",
      "zh-CN": "该操作会更新此音色 ID 的参考音频。所有使用该音色的合成都会受影响。",
    },
  },
  usageArgs: "--id <voice-id> --audio <url-or-path>",
  flags: UPDATE_FLAGS,
  notes: [
    ...VOICE_RIGHTS_NOTES,
    {
      "en-US":
        "Only reference audio can be updated. Design voices do not support voice_prompt updates via this command.",
      "zh-CN": "仅支持更新参考音频。设计音色不支持通过本命令更新 voice_prompt。",
    },
  ],
  exampleArgs: [
    "--id <voice-id> --audio ./new-reference.wav --dry-run --output json",
    "--id <voice-id> --audio ./new-reference.wav --yes",
  ],
  validate: (flags: UpdateFlags) => {
    const idError = validateVoiceId(flags.id);
    if (idError) return idError;
    if (isOmniManagedVoiceId(flags.id)) return OMNI_VOICE_UNSUPPORTED_OP;
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const voiceId = flags.id;
    const dryRun = settings.dryRun === true;
    const resolved = resolveVoiceAudioSource(flags.audio, { encodeLocal: !dryRun });

    const request = buildVoiceRequest("update_voice", {
      voice_id: voiceId,
      audio: resolved.audio,
    });

    if (dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVoiceCustomizationPath()),
        request: redactVoiceAudioInRequest(request, resolved.localPath),
      });
      return;
    }

    const response = await updateVoice(ctx.client, voiceId, resolved.audio);
    ctx.output.result(response, { text: voiceId });
  },
});
