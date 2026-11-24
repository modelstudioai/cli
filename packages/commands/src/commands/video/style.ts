import {
  defineCommand,
  videoGeneratePath,
  ASYNC_FLAG,
  stripUndefined,
  type DashScopeVideoStyleTransformRequest,
  type FlagsDef,
} from "bailian-cli-core";
import {
  extractStyleOutputVideoUrl,
  mediaInputError,
  runSpecializedVideoLifecycle,
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
      "en-US": "Output video FPS 15–25 (maps to video_fps)",
      "zh-CN": "输出视频帧率 15–25（映射为 video_fps）",
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
      "en-US": "Short-side length 540 or 720 (server default: 720)",
      "zh-CN": "短边长度 540 或 720（服务端默认 720）",
    },
  },
  superResolution: {
    type: "boolean",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable super-resolution (maps to use_SR; server default: false)",
      "zh-CN": "是否启用超分（映射为 use_SR；服务端默认 false）",
    },
  },
  download: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Save video to file on completion (default: output dir)",
      "zh-CN": "完成后将视频保存到文件（默认输出目录）",
    },
  },
  ...ASYNC_FLAG,
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval when waiting (default: 15)",
      "zh-CN": "等待任务时的轮询间隔（默认：15 秒）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Restyle a video (video-style-transform)",
    "zh-CN": "视频风格重绘（video-style-transform）",
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
        "Fixed model video-style-transform (Beijing only). Success field is output.output_video_url. Local paths are rejected until temporary OSS support is verified. Requires model access.",
      "zh-CN":
        "固定模型 video-style-transform（仅北京）。成功字段为 output.output_video_url。在临时 OSS 验证前拒绝本地路径。需账号已开通该模型权限。",
    },
  ],
  validate: (flags) => {
    if (
      flags.pollInterval !== undefined &&
      (!(flags.pollInterval > 0) || !Number.isFinite(flags.pollInterval))
    ) {
      return {
        "en-US": "--poll-interval must be a positive number.",
        "zh-CN": "--poll-interval 必须为正数。",
      };
    }
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
