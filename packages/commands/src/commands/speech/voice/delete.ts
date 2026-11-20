import {
  buildVoiceRequest,
  defineCommand,
  deleteVoice,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { validateVoiceId, VOICE_ID_FLAG } from "./shared.ts";

const DELETE_FLAGS = {
  ...VOICE_ID_FLAG,
} satisfies FlagsDef;
type DeleteFlags = ParsedFlags<typeof DELETE_FLAGS>;

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
  usageArgs: "--id <voice-id>",
  flags: DELETE_FLAGS,
  notes: [
    {
      "en-US": "Deletion is irreversible. Prefer --dry-run first to confirm the request body.",
      "zh-CN": "删除不可撤销。建议先用 --dry-run 确认请求体。",
    },
  ],
  exampleArgs: ["--id <voice-id> --dry-run --output json", "--id <voice-id> --yes"],
  validate: (flags: DeleteFlags) => validateVoiceId(flags.id),
  async run(ctx) {
    const { settings, flags } = ctx;
    const voiceId = flags.id;

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
