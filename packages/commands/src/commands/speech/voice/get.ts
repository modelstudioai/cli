import {
  buildVoiceRequest,
  defineCommand,
  queryVoice,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { validateVoiceId, VOICE_ID_FLAG } from "./shared.ts";

const GET_FLAGS = {
  ...VOICE_ID_FLAG,
} satisfies FlagsDef;
type GetFlags = ParsedFlags<typeof GET_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Get details of a custom voice",
    "zh-CN": "查看自定义音色详情",
  },
  auth: "apiKey",
  usageArgs: "--id <voice-id>",
  flags: GET_FLAGS,
  notes: [
    {
      "en-US":
        "Status DEPLOYING/OK/UNDEPLOYED is returned as data, not as a CLI failure. Use `speech voice preview` for the reference audio URL when present.",
      "zh-CN":
        "状态 DEPLOYING/OK/UNDEPLOYED 作为查询结果返回，不会因此失败退出。有参考音频时用 `speech voice preview` 获取。",
    },
  ],
  exampleArgs: ["--id <voice-id> --output json", "--id <voice-id> --quiet"],
  validate: (flags: GetFlags) => validateVoiceId(flags.id),
  async run(ctx) {
    const { settings, flags } = ctx;
    const voiceId = flags.id;

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVoiceCustomizationPath()),
        request: buildVoiceRequest("query_voice", { voice_id: voiceId }),
      });
      return;
    }

    const response = await queryVoice(ctx.client, voiceId);
    let text: string | undefined;
    if (settings.output === "text") {
      const output = response.output;
      text = [
        `voice_id: ${output?.voice_id ?? voiceId}`,
        `status: ${output?.status ?? ""}`,
        `target_model: ${output?.target_model ?? ""}`,
        `gmt_create: ${output?.gmt_create ?? ""}`,
        `gmt_modified: ${output?.gmt_modified ?? ""}`,
        output?.resource_link ? `resource_link: ${output.resource_link}` : undefined,
        output?.voice_prompt ? `voice_prompt: ${output.voice_prompt}` : undefined,
        output?.preview_text ? `preview_text: ${output.preview_text}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n");
    }
    ctx.output.result(response, { text });
  },
});
