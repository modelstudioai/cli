import { dirname } from "path";
import { mkdirSync } from "fs";
import {
  BailianError,
  buildVoiceRequest,
  defineCommand,
  ExitCode,
  queryVoice,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { downloadFile } from "bailian-cli-runtime";
import { validateVoiceId, VOICE_ID_FLAG } from "./shared.ts";

const PREVIEW_FLAGS = {
  ...VOICE_ID_FLAG,
  out: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Download the reference audio to this path",
      "zh-CN": "将参考音频下载到此路径",
    },
  },
} satisfies FlagsDef;
type PreviewFlags = ParsedFlags<typeof PREVIEW_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Fetch the reference audio URL for a cloned voice",
    "zh-CN": "获取复刻音色的参考音频地址",
  },
  auth: "apiKey",
  usageArgs: "--id <voice-id> [--out <path>]",
  flags: PREVIEW_FLAGS,
  notes: [
    {
      "en-US":
        "Returns resource_link from query_voice. This is the enrollment reference audio, not a synthesized preview. Use `speech synthesize` to hear the voice. Design voices may not include resource_link.",
      "zh-CN":
        "返回 query_voice 的 resource_link。这是复刻时的参考音频，不是合成试听。试听请用 `speech synthesize`。设计音色可能不含 resource_link。",
    },
  ],
  exampleArgs: ["--id <voice-id> --output json", "--id <voice-id> --out reference.wav"],
  validate: (flags: PreviewFlags) => validateVoiceId(flags.id),
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
    const resourceLink = response.output?.resource_link?.trim();
    if (!resourceLink) {
      throw new BailianError(
        ctx.localize({
          "en-US": "No reference audio URL (resource_link) is available for this voice.",
          "zh-CN": "该音色没有可用的参考音频地址（resource_link）。",
        }),
        ExitCode.GENERAL,
        ctx.localize({
          "en-US":
            "Design voices may omit resource_link. Use `speech synthesize --voice <id>` for a synthesized preview.",
          "zh-CN":
            "设计音色可能不返回 resource_link。请使用 `speech synthesize --voice <id>` 做合成试听。",
        }),
      );
    }

    let saved: string | undefined;
    if (flags.out) {
      mkdirSync(dirname(flags.out), { recursive: true });
      await downloadFile(resourceLink, flags.out, {
        quiet: settings.quiet || settings.output === "json",
      });
      saved = flags.out;
    }

    const result = {
      voice_id: response.output?.voice_id ?? voiceId,
      resource_link: resourceLink,
      saved,
      request_id: response.request_id,
    };

    let text: string | undefined;
    if (settings.output === "text") {
      text = saved
        ? `voice_id: ${result.voice_id}\nsaved: ${saved}`
        : `voice_id: ${result.voice_id}\nresource_link: ${resourceLink}`;
    }
    ctx.output.result(result, { text });
  },
});
