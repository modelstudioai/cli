/**
 * 全量压测套件：目标顺序与中文展示名。
 */

/** @type {Record<string, string>} */
export const TARGET_DISPLAY_NAMES = {
  text: "文本对话",
  "speech-tts": "语音合成",
  "speech-asr": "语音识别",
  "image-generate": "图片生成",
  "image-edit": "图片编辑",
  "video-t2v": "文生视频",
  "video-i2v": "图生视频",
  "video-ref": "视频参考生成",
  "video-edit": "视频编辑",
};

/** 套件执行顺序（顺序模式使用，视频类靠后，耗时更长） */
export const STRESS_SUITE_ORDER = [
  { canonical: "text", file: "text-chat.mjs" },
  { canonical: "speech-tts", file: "speech-synthesize.mjs" },
  { canonical: "speech-asr", file: "speech-recognize.mjs" },
  { canonical: "image-generate", file: "image-generate.mjs" },
  { canonical: "image-edit", file: "image-edit.mjs" },
  { canonical: "video-t2v", file: "video-t2v.mjs" },
  { canonical: "video-i2v", file: "video-i2v.mjs" },
  { canonical: "video-ref", file: "video-ref.mjs" },
  { canonical: "video-edit", file: "video-edit.mjs" },
];

/**
 * 并行模式分阶段执行计划。
 * Phase 1: 无外部依赖（可全部并行）
 * Phase 2: 依赖共享前置资源（在 Phase 0 统一生成后全部并行）
 */
export const SUITE_PHASES = [
  {
    label: "Phase 1（无依赖）",
    targets: [
      { canonical: "text", file: "text-chat.mjs" },
      { canonical: "speech-tts", file: "speech-synthesize.mjs" },
      { canonical: "image-generate", file: "image-generate.mjs" },
      { canonical: "video-t2v", file: "video-t2v.mjs" },
    ],
  },
  {
    label: "Phase 2（使用共享前置资源）",
    targets: [
      { canonical: "speech-asr", file: "speech-recognize.mjs" },
      { canonical: "image-edit", file: "image-edit.mjs" },
      { canonical: "video-i2v", file: "video-i2v.mjs" },
      { canonical: "video-ref", file: "video-ref.mjs" },
      { canonical: "video-edit", file: "video-edit.mjs" },
    ],
  },
];
