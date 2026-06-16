import { defineCommand, resolveCredential, detectOutputFormat, uploadFile } from "bailian-cli-core";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "file upload",
  description: "Upload a local file to DashScope temporary storage (48h)",
  usage: "bl file upload --file <path> --model <model>",
  options: [
    {
      flag: "--file <path>",
      description: "Local file to upload (image, video, audio)",
      required: true,
    },
    {
      flag: "--model <model>",
      description: "Target model name (file is bound to this model)",
      required: true,
    },
  ],
  examples: [
    "bl file upload --file photo.jpg --model qwen3-vl-plus",
    "bl file upload --file video.mp4 --model wan2.1-t2v-plus",
    "bl file upload --file audio.wav --model qwen3-asr-flash",
    "bl file upload --file cat.png --model qwen-image-2.0",
  ],
  async run(config, flags) {
    const filePath = flags.file;
    if (!filePath) {
      failIfMissing("file", "bl file upload --file <path> --model <model>");
    }

    const model = flags.model;
    if (!model) {
      failIfMissing("model", "bl file upload --file <path> --model <model>");
    }

    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      emitResult({ action: "upload", file: filePath, model }, format);
      return;
    }

    // Resolve API key for upload
    const credential = await resolveCredential(config);

    const ossUrl = await uploadFile({
      apiKey: credential.token,
      model: model!,
      filePath: filePath!,
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
