import {
  defineCommand,
  videoGeneratePath,
  ASYNC_FLAG,
  stripUndefined,
  type DashScopeVideoVaceRequest,
  type FlagsDef,
  type LocalizedText,
  type WanxVaceFunction,
} from "bailian-cli-core";
import { BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT, BOOL_FLAG_WATERMARK } from "bailian-cli-runtime";
import {
  extractVideoUrlField,
  mediaInputError,
  previewMediaUrl,
  resolveMediaUrl,
  runSpecializedVideoLifecycle,
} from "./specialized-shared.ts";

const MODEL = "wanx2.1-vace-plus";
const DEFAULT_FUNCTION: WanxVaceFunction = "video_repainting";

const VACE_FUNCTIONS = new Set<WanxVaceFunction>([
  "video_repainting",
  "video_edit",
  "video_extension",
  "video_outpainting",
  "image_reference",
]);

const REPAINT_CONTROL = new Set(["posebodyface", "posebody", "depth", "scribble"]);
const EDIT_CONTROL = new Set(["", "posebodyface", "depth"]);
const EXTENSION_CONTROL = new Set(["posebodyface", "depth"]);
const MASK_TYPES = new Set(["tracking", "fixed"]);
const EXPAND_MODES = new Set(["hull", "bbox", "original"]);
const ALLOWED_SIZES = new Set(["1280*720", "720*1280", "960*960", "832*1088", "1088*832"]);

const RETOUCH_FLAGS = {
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Edit / generation prompt (max 800 characters; server may truncate)",
      "zh-CN": "编辑/生成提示词（最多 800 字符；服务端可能截断）",
    },
    required: true,
  },
  function: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US":
        "VACE function: video_repainting (default), video_edit, video_extension, video_outpainting, image_reference",
      "zh-CN":
        "VACE 模式：video_repainting（默认）、video_edit、video_extension、video_outpainting、image_reference",
    },
    choices: [
      "video_repainting",
      "video_edit",
      "video_extension",
      "video_outpainting",
      "image_reference",
    ] as const,
  },
  video: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Input video URL or local file (required for most functions)",
      "zh-CN": "输入视频 URL 或本地文件（多数模式必填）",
    },
  },
  refImage: {
    type: "array",
    valueHint: "<url-or-path>",
    description: {
      "en-US":
        "Reference image(s): image_reference 1–3; video_repainting/video_edit at most 1; unsupported for video_extension/video_outpainting",
      "zh-CN":
        "参考图：image_reference 1–3 张；video_repainting/video_edit 最多 1 张；video_extension/video_outpainting 不支持",
    },
  },
  controlCondition: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US":
        "Control condition (required for video_repainting; posebodyface/posebody/depth/scribble)",
      "zh-CN": "控制条件（video_repainting 必填；posebodyface/posebody/depth/scribble）",
    },
  },
  strength: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Repaint strength in [0, 1]",
      "zh-CN": "重绘强度，范围 [0, 1]",
    },
  },
  seed: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Random seed",
      "zh-CN": "随机种子",
    },
  },
  promptExtend: {
    type: "boolean",
    valueHint: "<bool>",
    description: BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT,
  },
  watermark: {
    type: "boolean",
    valueHint: "<bool>",
    description: BOOL_FLAG_WATERMARK,
  },
  maskImage: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Mask image for video_edit (mutually exclusive with --mask-video)",
      "zh-CN": "video_edit 的掩码图（与 --mask-video 二选一）",
    },
  },
  maskVideo: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Mask video for video_edit (mutually exclusive with --mask-image)",
      "zh-CN": "video_edit 的掩码视频（与 --mask-image 二选一）",
    },
  },
  maskFrameId: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Mask frame id starting at 1 (video_edit)",
      "zh-CN": "掩码帧序号，从 1 起（video_edit）",
    },
  },
  maskType: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US": "Mask type: tracking or fixed (video_edit)",
      "zh-CN": "掩码类型：tracking 或 fixed（video_edit）",
    },
    choices: ["tracking", "fixed"] as const,
  },
  expandRatio: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Expand ratio in [0, 1] (video_edit)",
      "zh-CN": "扩展比例 [0, 1]（video_edit）",
    },
  },
  expandMode: {
    type: "string",
    valueHint: "<mode>",
    description: {
      "en-US": "Expand mode hull/bbox/original (image mask + tracking only)",
      "zh-CN": "扩展模式 hull/bbox/original（仅图像掩码 + tracking）",
    },
    choices: ["hull", "bbox", "original"] as const,
  },
  firstFrame: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "First-frame image for video_extension (extends forward)",
      "zh-CN": "video_extension 首帧图（向后延展）",
    },
  },
  lastFrame: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Last-frame image for video_extension (extends backward)",
      "zh-CN": "video_extension 尾帧图（向前延展）",
    },
  },
  firstClip: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "First clip for video_extension (extends forward)",
      "zh-CN": "video_extension 首片段（向后延展）",
    },
  },
  lastClip: {
    type: "string",
    valueHint: "<url-or-path>",
    description: {
      "en-US": "Last clip for video_extension (extends backward)",
      "zh-CN": "video_extension 尾片段（向前延展）",
    },
  },
  topScale: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Outpainting top scale in [1, 2] (1 = no expand)",
      "zh-CN": "画面扩展上边比例 [1, 2]（1 不扩展）",
    },
  },
  bottomScale: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Outpainting bottom scale in [1, 2]",
      "zh-CN": "画面扩展下边比例 [1, 2]",
    },
  },
  leftScale: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Outpainting left scale in [1, 2]",
      "zh-CN": "画面扩展左边比例 [1, 2]",
    },
  },
  rightScale: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Outpainting right scale in [1, 2]",
      "zh-CN": "画面扩展右边比例 [1, 2]",
    },
  },
  refRole: {
    type: "array",
    valueHint: "<obj|bg>",
    description: {
      "en-US": "Per-image role for image_reference (obj or bg; at most one bg)",
      "zh-CN": "image_reference 每张图的角色（obj 或 bg；最多一个 bg）",
    },
  },
  size: {
    type: "string",
    valueHint: "<WxH>",
    description: {
      "en-US":
        "Output size for image_reference / video_edit (1280*720, 720*1280, 960*960, 832*1088, 1088*832)",
      "zh-CN":
        "image_reference / video_edit 输出尺寸（1280*720、720*1280、960*960、832*1088、1088*832）",
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

type RetouchFlags = {
  prompt: string;
  function?: WanxVaceFunction;
  video?: string;
  refImage?: string[];
  controlCondition?: string;
  strength?: number;
  seed?: number;
  promptExtend?: boolean;
  watermark?: boolean;
  maskImage?: string;
  maskVideo?: string;
  maskFrameId?: number;
  maskType?: string;
  expandRatio?: number;
  expandMode?: string;
  firstFrame?: string;
  lastFrame?: string;
  firstClip?: string;
  lastClip?: string;
  topScale?: number;
  bottomScale?: number;
  leftScale?: number;
  rightScale?: number;
  refRole?: string[];
  size?: string;
  download?: string;
  async?: boolean;
  pollInterval?: number;
};

function resolveFunction(flags: RetouchFlags): WanxVaceFunction {
  return flags.function ?? DEFAULT_FUNCTION;
}

function rejectFlagsError(
  present: Array<[string, unknown]>,
  mode: WanxVaceFunction,
): LocalizedText | undefined {
  const used = present.filter(([, value]) => value !== undefined);
  if (used.length === 0) return undefined;
  const names = used.map(([name]) => name).join(", ");
  return {
    "en-US": `Flags not applicable to --function ${mode}: ${names}.`,
    "zh-CN": `以下参数不适用于 --function ${mode}：${names}。`,
  };
}

function scaleError(value: number | undefined, flagName: string): LocalizedText | undefined {
  if (value === undefined) return undefined;
  if (!(value >= 1 && value <= 2) || !Number.isFinite(value)) {
    return {
      "en-US": `${flagName} must be in [1, 2].`,
      "zh-CN": `${flagName} 必须在 [1, 2] 范围内。`,
    };
  }
  return undefined;
}

/** Mode / media / cross-flag checks for validate (before auth). */
function validateRetouchFlags(flags: RetouchFlags): LocalizedText | undefined {
  if (
    flags.pollInterval !== undefined &&
    (!(flags.pollInterval > 0) || !Number.isFinite(flags.pollInterval))
  ) {
    return {
      "en-US": "--poll-interval must be a positive number.",
      "zh-CN": "--poll-interval 必须为正数。",
    };
  }

  const mode = resolveFunction(flags);
  if (!VACE_FUNCTIONS.has(mode)) {
    return {
      "en-US": `Unsupported --function "${String(flags.function)}".`,
      "zh-CN": `不支持的 --function "${String(flags.function)}"。`,
    };
  }

  const refImages = flags.refImage ?? [];
  for (const image of refImages) {
    const refError = mediaInputError(image, "--ref-image", { allowLocal: true });
    if (refError) return refError;
  }

  const mediaFlags: Array<[string, string | undefined]> = [
    ["--video", flags.video],
    ["--mask-image", flags.maskImage],
    ["--mask-video", flags.maskVideo],
    ["--first-frame", flags.firstFrame],
    ["--last-frame", flags.lastFrame],
    ["--first-clip", flags.firstClip],
    ["--last-clip", flags.lastClip],
  ];
  for (const [name, value] of mediaFlags) {
    if (value !== undefined) {
      const mediaError = mediaInputError(value, name, { allowLocal: true });
      if (mediaError) return mediaError;
    }
  }

  switch (mode) {
    case "video_repainting": {
      const rejected = rejectFlagsError(
        [
          ["--mask-image", flags.maskImage],
          ["--mask-video", flags.maskVideo],
          ["--mask-frame-id", flags.maskFrameId],
          ["--mask-type", flags.maskType],
          ["--expand-ratio", flags.expandRatio],
          ["--expand-mode", flags.expandMode],
          ["--first-frame", flags.firstFrame],
          ["--last-frame", flags.lastFrame],
          ["--first-clip", flags.firstClip],
          ["--last-clip", flags.lastClip],
          ["--top-scale", flags.topScale],
          ["--bottom-scale", flags.bottomScale],
          ["--left-scale", flags.leftScale],
          ["--right-scale", flags.rightScale],
          ["--ref-role", flags.refRole],
          ["--size", flags.size],
        ],
        mode,
      );
      if (rejected) return rejected;
      if (!flags.video) {
        return {
          "en-US": "--video is required for video_repainting.",
          "zh-CN": "video_repainting 需要 --video。",
        };
      }
      if (!flags.controlCondition || !REPAINT_CONTROL.has(flags.controlCondition)) {
        return {
          "en-US":
            "--control-condition is required for video_repainting (posebodyface/posebody/depth/scribble).",
          "zh-CN":
            "video_repainting 需要 --control-condition（posebodyface/posebody/depth/scribble）。",
        };
      }
      if (refImages.length > 1) {
        return {
          "en-US": "video_repainting accepts at most one --ref-image.",
          "zh-CN": "video_repainting 最多一张 --ref-image。",
        };
      }
      if (
        flags.strength !== undefined &&
        (!(flags.strength >= 0 && flags.strength <= 1) || !Number.isFinite(flags.strength))
      ) {
        return {
          "en-US": "--strength must be in [0, 1].",
          "zh-CN": "--strength 必须在 [0, 1] 范围内。",
        };
      }
      return undefined;
    }
    case "video_edit": {
      const rejected = rejectFlagsError(
        [
          ["--first-frame", flags.firstFrame],
          ["--last-frame", flags.lastFrame],
          ["--first-clip", flags.firstClip],
          ["--last-clip", flags.lastClip],
          ["--top-scale", flags.topScale],
          ["--bottom-scale", flags.bottomScale],
          ["--left-scale", flags.leftScale],
          ["--right-scale", flags.rightScale],
          ["--ref-role", flags.refRole],
          ["--strength", flags.strength],
        ],
        mode,
      );
      if (rejected) return rejected;
      if (!flags.video) {
        return {
          "en-US": "--video is required for video_edit.",
          "zh-CN": "video_edit 需要 --video。",
        };
      }
      const hasMaskImage = flags.maskImage !== undefined;
      const hasMaskVideo = flags.maskVideo !== undefined;
      if (hasMaskImage === hasMaskVideo) {
        return {
          "en-US": "video_edit requires exactly one of --mask-image or --mask-video.",
          "zh-CN": "video_edit 需要在 --mask-image 与 --mask-video 中二选一。",
        };
      }
      if (refImages.length > 1) {
        return {
          "en-US": "video_edit accepts at most one --ref-image.",
          "zh-CN": "video_edit 最多一张 --ref-image。",
        };
      }
      if (flags.controlCondition !== undefined && !EDIT_CONTROL.has(flags.controlCondition)) {
        return {
          "en-US": "--control-condition for video_edit must be empty, posebodyface, or depth.",
          "zh-CN": "video_edit 的 --control-condition 只能是空、posebodyface 或 depth。",
        };
      }
      if (flags.maskType !== undefined && !MASK_TYPES.has(flags.maskType)) {
        return {
          "en-US": "--mask-type must be tracking or fixed.",
          "zh-CN": "--mask-type 必须是 tracking 或 fixed。",
        };
      }
      if (
        flags.expandRatio !== undefined &&
        (!(flags.expandRatio >= 0 && flags.expandRatio <= 1) || !Number.isFinite(flags.expandRatio))
      ) {
        return {
          "en-US": "--expand-ratio must be in [0, 1].",
          "zh-CN": "--expand-ratio 必须在 [0, 1] 范围内。",
        };
      }
      if (flags.expandMode !== undefined) {
        if (!EXPAND_MODES.has(flags.expandMode)) {
          return {
            "en-US": "--expand-mode must be hull, bbox, or original.",
            "zh-CN": "--expand-mode 必须是 hull、bbox 或 original。",
          };
        }
        if (!(hasMaskImage && flags.maskType === "tracking")) {
          return {
            "en-US": "--expand-mode is only valid with --mask-image and --mask-type tracking.",
            "zh-CN": "--expand-mode 仅在 --mask-image 且 --mask-type tracking 时可用。",
          };
        }
      }
      if (
        flags.maskFrameId !== undefined &&
        (!Number.isInteger(flags.maskFrameId) || flags.maskFrameId < 1)
      ) {
        return {
          "en-US": "--mask-frame-id must be an integer >= 1.",
          "zh-CN": "--mask-frame-id 必须是大于等于 1 的整数。",
        };
      }
      if (flags.size !== undefined && !ALLOWED_SIZES.has(flags.size)) {
        return {
          "en-US": "--size must be one of 1280*720, 720*1280, 960*960, 832*1088, 1088*832.",
          "zh-CN": "--size 必须是 1280*720、720*1280、960*960、832*1088、1088*832 之一。",
        };
      }
      return undefined;
    }
    case "video_extension": {
      const rejected = rejectFlagsError(
        [
          ["--mask-image", flags.maskImage],
          ["--mask-video", flags.maskVideo],
          ["--mask-frame-id", flags.maskFrameId],
          ["--mask-type", flags.maskType],
          ["--expand-ratio", flags.expandRatio],
          ["--expand-mode", flags.expandMode],
          ["--top-scale", flags.topScale],
          ["--bottom-scale", flags.bottomScale],
          ["--left-scale", flags.leftScale],
          ["--right-scale", flags.rightScale],
          ["--ref-role", flags.refRole],
          ["--size", flags.size],
          ["--strength", flags.strength],
          ["--ref-image", flags.refImage],
        ],
        mode,
      );
      if (rejected) return rejected;
      const mediaCount = [
        flags.video,
        flags.firstFrame,
        flags.lastFrame,
        flags.firstClip,
        flags.lastClip,
      ].filter((value) => value !== undefined).length;
      if (mediaCount < 1) {
        return {
          "en-US":
            "video_extension requires at least one of --video, --first-frame, --last-frame, --first-clip, --last-clip.",
          "zh-CN":
            "video_extension 需要在 --video / --first-frame / --last-frame / --first-clip / --last-clip 中至少提供一项。",
        };
      }
      if (flags.video) {
        if (!flags.controlCondition || !EXTENSION_CONTROL.has(flags.controlCondition)) {
          return {
            "en-US":
              "When --video is set for video_extension, --control-condition must be posebodyface or depth.",
            "zh-CN":
              "video_extension 提供 --video 时，--control-condition 必须是 posebodyface 或 depth。",
          };
        }
      } else if (flags.controlCondition !== undefined) {
        if (!EXTENSION_CONTROL.has(flags.controlCondition)) {
          return {
            "en-US": "--control-condition for video_extension must be posebodyface or depth.",
            "zh-CN": "video_extension 的 --control-condition 必须是 posebodyface 或 depth。",
          };
        }
      }
      return undefined;
    }
    case "video_outpainting": {
      const rejected = rejectFlagsError(
        [
          ["--mask-image", flags.maskImage],
          ["--mask-video", flags.maskVideo],
          ["--mask-frame-id", flags.maskFrameId],
          ["--mask-type", flags.maskType],
          ["--expand-ratio", flags.expandRatio],
          ["--expand-mode", flags.expandMode],
          ["--first-frame", flags.firstFrame],
          ["--last-frame", flags.lastFrame],
          ["--first-clip", flags.firstClip],
          ["--last-clip", flags.lastClip],
          ["--ref-role", flags.refRole],
          ["--size", flags.size],
          ["--strength", flags.strength],
          ["--control-condition", flags.controlCondition],
          ["--ref-image", flags.refImage],
        ],
        mode,
      );
      if (rejected) return rejected;
      if (!flags.video) {
        return {
          "en-US": "--video is required for video_outpainting.",
          "zh-CN": "video_outpainting 需要 --video。",
        };
      }
      return (
        scaleError(flags.topScale, "--top-scale") ||
        scaleError(flags.bottomScale, "--bottom-scale") ||
        scaleError(flags.leftScale, "--left-scale") ||
        scaleError(flags.rightScale, "--right-scale")
      );
    }
    case "image_reference": {
      const rejected = rejectFlagsError(
        [
          ["--video", flags.video],
          ["--mask-image", flags.maskImage],
          ["--mask-video", flags.maskVideo],
          ["--mask-frame-id", flags.maskFrameId],
          ["--mask-type", flags.maskType],
          ["--expand-ratio", flags.expandRatio],
          ["--expand-mode", flags.expandMode],
          ["--first-frame", flags.firstFrame],
          ["--last-frame", flags.lastFrame],
          ["--first-clip", flags.firstClip],
          ["--last-clip", flags.lastClip],
          ["--top-scale", flags.topScale],
          ["--bottom-scale", flags.bottomScale],
          ["--left-scale", flags.leftScale],
          ["--right-scale", flags.rightScale],
          ["--strength", flags.strength],
          ["--control-condition", flags.controlCondition],
        ],
        mode,
      );
      if (rejected) return rejected;
      if (refImages.length < 1 || refImages.length > 3) {
        return {
          "en-US": "image_reference requires 1–3 --ref-image values.",
          "zh-CN": "image_reference 需要 1–3 张 --ref-image。",
        };
      }
      if (flags.refRole !== undefined) {
        if (flags.refRole.length !== refImages.length) {
          return {
            "en-US": "--ref-role count must match --ref-image count.",
            "zh-CN": "--ref-role 数量必须与 --ref-image 一致。",
          };
        }
        let bgCount = 0;
        for (const role of flags.refRole) {
          if (role !== "obj" && role !== "bg") {
            return {
              "en-US": '--ref-role values must be "obj" or "bg".',
              "zh-CN": '--ref-role 取值必须是 "obj" 或 "bg"。',
            };
          }
          if (role === "bg") bgCount += 1;
        }
        if (bgCount > 1) {
          return {
            "en-US": "At most one --ref-role bg is allowed.",
            "zh-CN": "--ref-role 最多只能有一个 bg。",
          };
        }
      }
      if (flags.size !== undefined && !ALLOWED_SIZES.has(flags.size)) {
        return {
          "en-US": "--size must be one of 1280*720, 720*1280, 960*960, 832*1088, 1088*832.",
          "zh-CN": "--size 必须是 1280*720、720*1280、960*960、832*1088、1088*832 之一。",
        };
      }
      return undefined;
    }
    default: {
      const _exhaustive: never = mode;
      return {
        "en-US": `Unsupported --function "${String(_exhaustive)}".`,
        "zh-CN": `不支持的 --function "${String(_exhaustive)}"。`,
      };
    }
  }
}

function buildVaceRequest(
  flags: RetouchFlags,
  mode: WanxVaceFunction,
  media: {
    videoUrl?: string;
    refImages?: string[];
    maskImageUrl?: string;
    maskVideoUrl?: string;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    firstClipUrl?: string;
    lastClipUrl?: string;
  },
): DashScopeVideoVaceRequest {
  const input = stripUndefined({
    function: mode,
    prompt: flags.prompt,
    video_url: media.videoUrl,
    ref_images_url: media.refImages,
    mask_image_url: media.maskImageUrl,
    mask_video_url: media.maskVideoUrl,
    mask_frame_id: flags.maskFrameId,
    first_frame_url: media.firstFrameUrl,
    last_frame_url: media.lastFrameUrl,
    first_clip_url: media.firstClipUrl,
    last_clip_url: media.lastClipUrl,
  }) as DashScopeVideoVaceRequest["input"];

  const objOrBg = flags.refRole === undefined ? undefined : (flags.refRole as Array<"obj" | "bg">);

  const parameters = stripUndefined({
    control_condition: flags.controlCondition === "" ? undefined : flags.controlCondition,
    strength: flags.strength,
    prompt_extend: flags.promptExtend,
    watermark: flags.watermark,
    seed: flags.seed,
    mask_type: flags.maskType,
    expand_ratio: flags.expandRatio,
    expand_mode: flags.expandMode,
    size: flags.size,
    top_scale: flags.topScale,
    bottom_scale: flags.bottomScale,
    left_scale: flags.leftScale,
    right_scale: flags.rightScale,
    obj_or_bg: objOrBg,
  });

  return {
    model: MODEL,
    input,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
  };
}

export default defineCommand({
  description: {
    "en-US":
      "Wan 2.1 VACE unified video edit (repaint / local edit / extension / outpainting / image reference)",
    "zh-CN": "万相 2.1 VACE 统一视频编辑（重绘/局部编辑/延展/画面扩展/多图参考）",
  },
  auth: "apiKey",
  usageArgs: "--prompt <text> [--function <mode>] [flags]",
  flags: RETOUCH_FLAGS,
  exampleArgs: [
    {
      "en-US":
        '--prompt "Convert the scene to claymation" --function video_repainting --video https://example.com/in.mp4 --control-condition depth --strength 0.8',
      "zh-CN":
        '--prompt "将场景转为黏土风格" --function video_repainting --video https://example.com/in.mp4 --control-condition depth --strength 0.8',
    },
    {
      "en-US":
        '--prompt "Extend the shot" --function video_extension --first-frame https://example.com/first.png',
      "zh-CN":
        '--prompt "延展镜头" --function video_extension --first-frame https://example.com/first.png',
    },
    {
      "en-US":
        '--prompt "Generate from references" --function image_reference --ref-image https://example.com/a.png --ref-image https://example.com/b.png --ref-role obj --ref-role bg --size 1280*720',
      "zh-CN":
        '--prompt "参考图生成" --function image_reference --ref-image https://example.com/a.png --ref-image https://example.com/b.png --ref-role obj --ref-role bg --size 1280*720',
    },
  ],
  notes: [
    {
      "en-US":
        "Fixed model wanx2.1-vace-plus (Beijing/Singapore). Distinct from `video edit` (happyhorse). Output is silent MP4. video_extension: first-frame/clip extends forward, last-frame/clip extends backward; total output is 5s. Requires model access. Do not use a boolean --video-extension alias.",
      "zh-CN":
        "固定模型 wanx2.1-vace-plus（北京/新加坡）。与 `video edit`（happyhorse）不同。输出为无声 MP4。video_extension：首帧/首片段向后延展，尾帧/尾片段向前延展；完整输出共 5 秒。需账号已开通该模型权限。不要使用布尔 --video-extension 别名。",
    },
  ],
  validate: (flags) => validateRetouchFlags(flags as RetouchFlags),
  async run(ctx) {
    const flags = ctx.flags as RetouchFlags;
    const mode = resolveFunction(flags);

    if (flags.prompt.length > 800) {
      ctx.output.info({
        "en-US":
          "Prompt exceeds 800 characters; the server may truncate it. The CLI does not modify the text.",
        "zh-CN": "提示词超过 800 字符，服务端可能截断；CLI 不会改写原文。",
      });
    }

    const previewMedia = {
      videoUrl: flags.video !== undefined ? previewMediaUrl(flags.video) : undefined,
      refImages: flags.refImage?.map((image) => previewMediaUrl(image)),
      maskImageUrl: flags.maskImage !== undefined ? previewMediaUrl(flags.maskImage) : undefined,
      maskVideoUrl: flags.maskVideo !== undefined ? previewMediaUrl(flags.maskVideo) : undefined,
      firstFrameUrl: flags.firstFrame !== undefined ? previewMediaUrl(flags.firstFrame) : undefined,
      lastFrameUrl: flags.lastFrame !== undefined ? previewMediaUrl(flags.lastFrame) : undefined,
      firstClipUrl: flags.firstClip !== undefined ? previewMediaUrl(flags.firstClip) : undefined,
      lastClipUrl: flags.lastClip !== undefined ? previewMediaUrl(flags.lastClip) : undefined,
    };

    const previewRequest = buildVaceRequest(flags, mode, previewMedia);

    await runSpecializedVideoLifecycle(ctx, {
      endpointPath: videoGeneratePath(),
      previewRequest,
      resolveLiveRequest: async () => {
        const videoUrl =
          flags.video !== undefined
            ? await resolveMediaUrl(ctx.client, flags.video, MODEL)
            : undefined;
        const refImages =
          flags.refImage !== undefined
            ? await Promise.all(
                flags.refImage.map((image) => resolveMediaUrl(ctx.client, image, MODEL)),
              )
            : undefined;
        const maskImageUrl =
          flags.maskImage !== undefined
            ? await resolveMediaUrl(ctx.client, flags.maskImage, MODEL)
            : undefined;
        const maskVideoUrl =
          flags.maskVideo !== undefined
            ? await resolveMediaUrl(ctx.client, flags.maskVideo, MODEL)
            : undefined;
        const firstFrameUrl =
          flags.firstFrame !== undefined
            ? await resolveMediaUrl(ctx.client, flags.firstFrame, MODEL)
            : undefined;
        const lastFrameUrl =
          flags.lastFrame !== undefined
            ? await resolveMediaUrl(ctx.client, flags.lastFrame, MODEL)
            : undefined;
        const firstClipUrl =
          flags.firstClip !== undefined
            ? await resolveMediaUrl(ctx.client, flags.firstClip, MODEL)
            : undefined;
        const lastClipUrl =
          flags.lastClip !== undefined
            ? await resolveMediaUrl(ctx.client, flags.lastClip, MODEL)
            : undefined;
        return buildVaceRequest(flags, mode, {
          videoUrl,
          refImages,
          maskImageUrl,
          maskVideoUrl,
          firstFrameUrl,
          lastFrameUrl,
          firstClipUrl,
          lastClipUrl,
        });
      },
      extractVideoUrl: extractVideoUrlField,
      pollInterval: flags.pollInterval,
      download: flags.download,
      async: flags.async,
    });
  },
});
