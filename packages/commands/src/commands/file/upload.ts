import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: {
    "en-US": "Upload a local file to DashScope temporary storage (48h)",
    "zh-CN": "将本地文件上传到 DashScope 临时存储（保留 48 小时）",
  },
  auth: "apiKey",
  usageArgs: "--file <path> --model <model>",
  flags: {
    file: {
      type: "string",
      valueHint: "<path>",
      description: {
        "en-US": "Local file to upload (image, video, audio)",
        "zh-CN": "要上传的本地文件（图片、视频或音频）",
      },
      required: true,
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: {
        "en-US": "Target model name (file is bound to this model)",
        "zh-CN": "目标模型名称（文件将与该模型绑定）",
      },
      required: true,
    },
  },
  exampleArgs: [
    "--file photo.jpg --model qwen3-vl-plus",
    "--file video.mp4 --model wan2.1-t2v-plus",
    "--file audio.wav --model qwen3-asr-flash",
    "--file cat.png --model qwen-image-3.0",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const filePath = flags.file;
    const model = flags.model;

    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult({ action: "upload", file: filePath, model }, format);
      return;
    }

    const ossUrl = await ctx.client.uploadFile(filePath, model);

    if (settings.quiet) {
      emitBare(ossUrl);
    } else {
      emitResult(
        {
          url: ossUrl,
          model,
          expires_in: "48 hours",
          note: "When using this URL in API calls, add header: X-DashScope-OssResourceResolve: enable",
        },
        format,
      );
    }
  },
});
