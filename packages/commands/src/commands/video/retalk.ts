import {
  defineCommand,
  image2videoPath,
  stripUndefined,
  type DashScopeVideoRetalkRequest,
  type FlagsDef,
} from "bailian-cli-core";
import {
  extractVideoUrlField,
  mediaInputError,
  previewMediaUrl,
  resolveMediaUrl,
  runSpecializedVideoLifecycle,
  SPECIALIZED_VIDEO_SHARED_FLAGS,
  specializedLifecycleFlagError,
} from "./specialized-shared.ts";

const MODEL = "videoretalk";

const RETALK_FLAGS = {
  video: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Input video URL or local file (mp4/avi/mov)",
      "zh-CN": "输入视频 URL 或本地文件（mp4/avi/mov）",
    },
    required: true,
  },
  audio: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Driving audio URL or local file (wav/mp3/aac)",
      "zh-CN": "驱动音频 URL 或本地文件（wav/mp3/aac）",
    },
    required: true,
  },
  refImage: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Optional reference face image when the video has multiple people",
      "zh-CN": "多人视频中可选的参考人脸图",
    },
  },
  videoExtension: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US":
        "Extend video by alternating reverse/forward playback when audio is longer (default: false)",
      "zh-CN": "音频长于视频时是否倒放/正放交替延展（默认 false）",
    },
  },
  faceThreshold: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Face match threshold 120–200 (default: 170; only with --ref-image)",
      "zh-CN": "人脸匹配阈值 120–200（默认 170；仅与 --ref-image 联用）",
    },
  },
  ...SPECIALIZED_VIDEO_SHARED_FLAGS,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Drive a talking-head video with audio (VideoRetalk)",
    "zh-CN": "用音频驱动人像口型视频（VideoRetalk）",
  },
  auth: "apiKey",
  usageArgs: "--video <url-or-path> --audio <url-or-path> [flags]",
  flags: RETALK_FLAGS,
  exampleArgs: [
    {
      "en-US":
        "--video https://example.com/face.mp4 --audio https://example.com/speech.wav --download out.mp4",
      "zh-CN":
        "--video https://example.com/face.mp4 --audio https://example.com/speech.wav --download out.mp4",
    },
    {
      "en-US":
        "--video ./face.mp4 --audio ./speech.wav --ref-image ./person.jpg --face-threshold 170",
      "zh-CN":
        "--video ./face.mp4 --audio ./speech.wav --ref-image ./person.jpg --face-threshold 170",
    },
  ],
  notes: [
    {
      "en-US":
        "Fixed model videoretalk (Beijing only). Wait-mode polling uses at least 600s (--timeout lower values are raised).",
      "zh-CN":
        "固定模型 videoretalk（仅北京）。等待模式轮询至少 600 秒（更小的 --timeout 会被抬高）。",
    },
  ],
  validate: (flags) => {
    const sharedError = specializedLifecycleFlagError(flags);
    if (sharedError) return sharedError;
    if (flags.faceThreshold !== undefined) {
      if (
        !Number.isInteger(flags.faceThreshold) ||
        flags.faceThreshold < 120 ||
        flags.faceThreshold > 200
      ) {
        return {
          "en-US": "--face-threshold must be an integer between 120 and 200.",
          "zh-CN": "--face-threshold 必须是 120–200 的整数。",
        };
      }
      if (!flags.refImage) {
        return {
          "en-US": "--face-threshold requires --ref-image.",
          "zh-CN": "--face-threshold 需要同时提供 --ref-image。",
        };
      }
    }
    const videoError = mediaInputError(flags.video, "--video", { allowLocal: true });
    if (videoError) return videoError;
    const audioError = mediaInputError(flags.audio, "--audio", { allowLocal: true });
    if (audioError) return audioError;
    if (flags.refImage !== undefined) {
      const refError = mediaInputError(flags.refImage, "--ref-image", { allowLocal: true });
      if (refError) return refError;
    }
    return undefined;
  },
  async run(ctx) {
    const { flags } = ctx;

    function buildRequest(media: {
      videoUrl: string;
      audioUrl: string;
      refImageUrl?: string;
    }): DashScopeVideoRetalkRequest {
      const parameters = stripUndefined({
        video_extension: flags.videoExtension,
        query_face_threshold: flags.faceThreshold,
      });
      return {
        model: MODEL,
        input: stripUndefined({
          video_url: media.videoUrl,
          audio_url: media.audioUrl,
          ref_image_url: media.refImageUrl,
        }) as DashScopeVideoRetalkRequest["input"],
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      };
    }

    const previewRequest = buildRequest({
      videoUrl: previewMediaUrl(flags.video),
      audioUrl: previewMediaUrl(flags.audio),
      refImageUrl: flags.refImage !== undefined ? previewMediaUrl(flags.refImage) : undefined,
    });

    await runSpecializedVideoLifecycle(ctx, {
      endpointPath: image2videoPath(),
      previewRequest,
      resolveLiveRequest: async () => {
        const videoUrl = await resolveMediaUrl(ctx.client, flags.video, MODEL);
        const audioUrl = await resolveMediaUrl(ctx.client, flags.audio, MODEL);
        const refImageUrl =
          flags.refImage !== undefined
            ? await resolveMediaUrl(ctx.client, flags.refImage, MODEL)
            : undefined;
        return buildRequest({ videoUrl, audioUrl, refImageUrl });
      },
      extractVideoUrl: extractVideoUrlField,
      pollInterval: flags.pollInterval,
      download: flags.download,
      async: flags.async,
    });
  },
});
