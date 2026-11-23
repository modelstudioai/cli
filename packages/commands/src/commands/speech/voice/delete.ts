import {
  buildOmniVoiceRequest,
  buildVoiceRequest,
  defineCommand,
  deleteOmniVoice,
  deleteVoice,
  isOmniVoiceTargetModel,
  looksLikeOmniClonedVoiceId,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { validateVoiceId, VOICE_ID_FLAG } from "./shared.ts";

const DELETE_FLAGS = {
  ...VOICE_ID_FLAG,
  targetModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "Protocol switch only: any qwen3.x-omni* id selects qwen-voice-enrollment delete. Also auto-detected when --id starts with qwen-omni-vc-",
      "zh-CN":
        "仅用于选择协议：任意 qwen3.x-omni* 走 qwen-voice-enrollment 删除；--id 以 qwen-omni-vc- 开头时也会自动识别",
    },
  },
} satisfies FlagsDef;
type DeleteFlags = ParsedFlags<typeof DELETE_FLAGS>;

function useOmniDelete(flags: DeleteFlags): boolean {
  if (flags.targetModel !== undefined && isOmniVoiceTargetModel(flags.targetModel)) {
    return true;
  }
  return looksLikeOmniClonedVoiceId(flags.id.trim());
}

export default defineCommand({
  description: {
    "en-US": "Delete a custom voice",
    "zh-CN": "删除自定义音色",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the voice ID. Synthesis that still references it will fail and the action cannot be undone.",
      "zh-CN": "该操作会永久删除此音色 ID。仍引用它的合成会失败，且无法撤销。",
    },
  },
  usageArgs: "--id <voice-id> [--target-model <model>]",
  flags: DELETE_FLAGS,
  notes: [
    {
      "en-US":
        "Deletion is irreversible. Prefer --dry-run first to confirm the request body. CosyVoice/Qwen-Audio: delete_voice + voice_id. Omni: delete + voice.",
      "zh-CN":
        "删除不可撤销。建议先用 --dry-run 确认请求体。CosyVoice/Qwen-Audio：delete_voice + voice_id。Omni：delete + voice。",
    },
  ],
  exampleArgs: [
    "--id <voice-id> --dry-run --output json",
    "--id <voice-id> --yes",
    "--id qwen-omni-vc-guanyu-voice-… --dry-run --output json",
  ],
  validate: (flags: DeleteFlags) => {
    const idError = validateVoiceId(flags.id);
    if (idError) return idError;
    if (flags.targetModel !== undefined && !isOmniVoiceTargetModel(flags.targetModel)) {
      return {
        "en-US":
          "--target-model on delete only selects the Omni enrollment protocol (pass any qwen3.x-omni* id). Omit it for CosyVoice/Qwen-Audio, or rely on qwen-omni-vc-* id auto-detect.",
        "zh-CN":
          "delete 的 --target-model 仅用于选择 Omni 复刻协议（传入任意 qwen3.x-omni* 即可）。CosyVoice/Qwen-Audio 请省略；也可依赖 qwen-omni-vc-* id 自动识别。",
      };
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const voiceId = flags.id;

    if (useOmniDelete(flags)) {
      if (settings.dryRun) {
        ctx.output.result({
          endpoint: ctx.client.url(speechVoiceCustomizationPath()),
          request: buildOmniVoiceRequest("delete", { voice: voiceId }),
        });
        return;
      }

      const response = await deleteOmniVoice(ctx.client, voiceId);
      ctx.output.result(response, { text: voiceId });
      return;
    }

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVoiceCustomizationPath()),
        request: buildVoiceRequest("delete_voice", { voice_id: voiceId }),
      });
      return;
    }

    const response = await deleteVoice(ctx.client, voiceId);
    ctx.output.result(response, { text: voiceId });
  },
});
