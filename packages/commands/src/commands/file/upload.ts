import { defineCommand, resolveCredential, detectOutputFormat, uploadFile } from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

export default defineCommand({
  description: "Upload a local file to DashScope temporary storage (48h)",
  auth: "apiKey",
  usageArgs: "--file <path> --model <model>",
  flags: {
    file: {
      type: "string",
      valueHint: "<path>",
      description: "Local file to upload (image, video, audio)",
      required: true,
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Target model name (file is bound to this model)",
      required: true,
    },
  },
  exampleArgs: [
    "--file photo.jpg --model qwen3-vl-plus",
    "--file video.mp4 --model wan2.1-t2v-plus",
    "--file audio.wav --model qwen3-asr-flash",
    "--file cat.png --model qwen-image-2.0",
  ],
  async run(config, flags) {
    const filePath = flags.file;
    const model = flags.model;

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "upload", file: filePath, model }, format);
      return;
    }

    // Resolve API key for upload
    const credential = await resolveCredential(config);

    const ossUrl = await uploadFile({
      apiKey: credential.token,
      model,
      filePath,
    });

    if (config.quiet) {
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
