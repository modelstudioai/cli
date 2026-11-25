import {
  defineCommand,
  videoGeneratePath,
  stripUndefined,
  type DashScopeVideoStyleTransformRequest,
  type FlagsDef,
} from "bailian-cli-core";
import {
  extractStyleOutputVideoUrl,
  mediaInputError,
  runSpecializedVideoLifecycle,
  SPECIALIZED_VIDEO_SHARED_FLAGS,
  specializedLifecycleFlagError,
} from "./specialized-shared.ts";

const MODEL = "video-style-transform";

const STYLE_FLAGS = {
  video: {
    type: "string",
    valueHint: "<url>",
    description: {
      "en-US": "Input video public URL (local paths not supported in v1)",
      "zh-CN": "输入视频公网 URL（v1 不支持本地路径）",
    },
    required: true,
  },
  style: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US":
        "Style ID 0–7 (default: 0). 0 Japanese comic, 1 American comic, 2 fresh comic, 3 3D cartoon, 4 Chinese cartoon, 5 paper art, 6 simple illustration, 7 Chinese ink",
      "zh-CN":
        "风格编号 0–7（默认 0）。0 日式漫画、1 美式漫画、2 清新漫画、3 3D 卡通、4 国风卡通、5 纸艺、6 简易插画、7 国风水墨",
    },
  },
  fps: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Output video FPS 15–25 (default: 15; maps to video_fps)",
      "zh-CN": "输出视频帧率 15–25（默认 15；映射为 video_fps）",
    },
  },
  animateEmotion: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Animate facial emotion (server default: true)",
      "zh-CN": "是否动画化表情（服务端默认 true）",
    },
  },
  minLen: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Short-side length 540 or 720 (server default: 720; 720P costs more than 540P)",
      "zh-CN": "短边长度 540 或 720（服务端默认 720；720P 比 540P 更贵）",
    },
  },
  superResolution: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US":
        "Enable super-resolution (maps to use_SR; server default: false; with min_len=540 outputs 1080P billed as 540P)",
      "zh-CN":
        "是否启用超分（映射为 use_SR；服务端默认 false；min_len=540 时输出 1080P 仍按 540P 计费）",
    },
  },
  ...SPECIALIZED_VIDEO_SHARED_FLAGS,
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US":
      "Restyle a video with 8 presets (video-style-transform); for prompt-based edit use video edit",
    "zh-CN": "按 8 种预设风格重绘视频（video-style-transform）；基于提示词的编辑请用 video edit",
  },
  auth: "apiKey",
  usageArgs: "--video <url> [flags]",
  flags: STYLE_FLAGS,
  exampleArgs: [
    {
      "en-US": "--video https://example.com/clip.mp4 --style 0 --download styled.mp4",
      "zh-CN": "--video https://example.com/clip.mp4 --style 0 --download styled.mp4",
    },
    {
      "en-US":
        "--video https://example.com/clip.mp4 --style 4 --fps 15 --min-len 540 --super-resolution true",
      "zh-CN":
        "--video https://example.com/clip.mp4 --style 4 --fps 15 --min-len 540 --super-resolution true",
    },
  ],
  notes: [
    {
      "en-US":
        "Fixed model video-style-transform (Beijing only). Wait-mode polling uses at least 600s (--timeout lower values are raised).",
      "zh-CN":
        "固定模型 video-style-transform（仅北京）。等待模式轮询至少 600 秒（更小的 --timeout 会被抬高）。",
    },
  ],
  validate: (flags) => {
    const sharedError = specializedLifecycleFlagError(flags);
    if (sharedError) return sharedError;
    if (flags.style !== undefined) {
      if (!Number.isInteger(flags.style) || flags.style < 0 || flags.style > 7) {
        return {
          "en-US": "--style must be an integer between 0 and 7.",
          "zh-CN": "--style 必须是 0–7 的整数。",
        };
      }
    }
    if (flags.fps !== undefined) {
      if (!Number.isInteger(flags.fps) || flags.fps < 15 || flags.fps > 25) {
        return {
          "en-US": "--fps must be an integer between 15 and 25.",
          "zh-CN": "--fps 必须是 15–25 的整数。",
        };
      }
    }
    if (flags.minLen !== undefined && flags.minLen !== 540 && flags.minLen !== 720) {
      return {
        "en-US": "--min-len must be 540 or 720.",
        "zh-CN": "--min-len 必须是 540 或 720。",
      };
    }
    return mediaInputError(flags.video, "--video", { allowLocal: false });
  },
  async run(ctx) {
    const { flags } = ctx;

    const parameters = stripUndefined({
      style: flags.style,
      video_fps: flags.fps,
      animate_emotion: flags.animateEmotion,
      min_len: flags.minLen,
      use_SR: flags.superResolution,
    });
    const request: DashScopeVideoStyleTransformRequest = {
      model: MODEL,
      input: { video_url: flags.video },
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };

    await runSpecializedVideoLifecycle(ctx, {
      endpointPath: videoGeneratePath(),
      previewRequest: request,
      resolveLiveRequest: async () => request,
      extractVideoUrl: extractStyleOutputVideoUrl,
      pollInterval: flags.pollInterval,
      download: flags.download,
      async: flags.async,
    });
  },
});
