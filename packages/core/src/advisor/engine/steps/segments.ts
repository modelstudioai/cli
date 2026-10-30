import type { IntentProfile, IntentSegment, Modality } from "../types.ts";

/** Max steps a plan is allowed to have; longer decompositions are truncated. */
export const MAX_STEPS = 5;

/** Capability codes the catalog actually uses (anything else from the LLM is dropped). */
const KNOWN_CAPS = new Set([
  "TG",
  "Reasoning",
  "VU",
  "IG",
  "VG",
  "TTS",
  "ASR",
  "Realtime-ASR",
  "Realtime-Text-to-Speech",
  "Realtime-Audio-Translate",
  "Realtime-Chatting",
  "Realtime-Omni",
  "Multimodal-Omni",
  "ME",
  "TR",
  "3D-generation",
]);

/**
 * Capabilities that define what a step produces. "Reasoning" is a modifier of
 * TG, never a step's primary capability on its own.
 */
const MODIFIER_CAPS = new Set(["Reasoning"]);

/** Scene labels relevant to each primary capability (subset of the 33-scene enum). */
const CAP_SCENES: Record<string, string[]> = {
  TG: [
    "代码生成",
    "创意写作",
    "客服对话",
    "知识问答",
    "文档理解",
    "数据分析",
    "数学推理",
    "翻译",
    "Agent编排",
    "深度研究",
    "教育辅导",
    "电商营销",
    "角色扮演",
    "情感分析",
    "意图识别",
  ],
  VU: ["文档理解", "OCR文字识别", "数据分析"],
  IG: ["图像生成", "图像编辑", "图像修复", "人脸人像", "虚拟试穿", "电商营销"],
  VG: ["视频生成", "视频编辑", "数字人"],
  TTS: ["语音合成", "有声书", "播客", "数字人"],
  ASR: ["语音识别"],
  "Realtime-ASR": ["语音识别", "实时对话"],
  TR: ["向量检索", "语义重排", "知识问答"],
  ME: ["向量检索"],
  "3D-generation": ["3D生成"],
};

/** Fallback scene for capabilities with one obvious "generation" scene. */
const CAP_DEFAULT_SCENE: Record<string, string> = {
  IG: "图像生成",
  VG: "视频生成",
  TTS: "语音合成",
  ASR: "语音识别",
};

/**
 * Step label keywords → scene, used when the LLM gave no per-step scene.
 * Checked in order; first hit wins.
 */
const LABEL_SCENE_RULES: [RegExp, string][] = [
  [/重排|rerank/i, "语义重排"],
  [/向量|嵌入|embedding|索引/i, "向量检索"],
  [/翻译|translat/i, "翻译"],
  [/代码|编程|code/i, "代码生成"],
  [/剧本|脚本|文案|歌词|故事|小说|创作|写作|script|lyric/i, "创意写作"],
  [/纪要|摘要|总结|整理|summar/i, "文档理解"],
  [/问答|回答|答案|answer/i, "知识问答"],
  [/转写|识别|听写|transcri/i, "语音识别"],
  [/配音|旁白|朗读|语音合成|voice/i, "语音合成"],
  [/数字人|口型|lip/i, "数字人"],
];

/**
 * Post-production that is not a model step (editing, muxing, subtitles).
 * Dropped when the LLM attached no capability to it.
 */
const ASSEMBLY_RE =
  /剪辑|合成剪辑|合轨|混音|拼接|加字幕|字幕合成|后期|导出|assembl|edit(ing)? together|mux/i;

/** A validated, ready-to-run step. */
export interface PlanStep {
  index: number;
  label: string;
  inputModality: Modality[];
  outputModality: Modality[];
  /** Capability every candidate must have. */
  primaryCapability: string;
  /** All (validated) capabilities of the step, primary first. */
  capabilities: string[];
  /** Scene that describes this step (from the LLM, or inferred from the label). */
  scene?: string;
}

/** Infer the producing capability from a step's modality pair when the LLM gave none. */
function inferCapability(input: Modality[], output: Modality[]): string | undefined {
  const out = output[0];
  if (out === "Image") return "IG";
  if (out === "Video") return "VG";
  if (out === "Audio")
    return input.includes("Audio") && !input.includes("Text") ? undefined : "TTS";
  if (out === "Text") {
    if (input.includes("Audio")) return "ASR";
    if (input.includes("Image") || input.includes("Video")) return "VU";
    return "TG";
  }
  return undefined;
}

function defaultLabel(cap: string): string {
  const labels: Record<string, string> = {
    TG: "文本生成",
    VU: "视觉理解",
    IG: "图像生成",
    VG: "视频生成",
    TTS: "语音合成",
    ASR: "语音识别",
    TR: "文本检索",
    ME: "多模态检索",
    "3D-generation": "3D 生成",
  };
  return labels[cap] ?? cap;
}

/**
 * Turn the LLM's raw segments into executable steps: drop invalid capability
 * codes, infer a missing capability from modalities, drop steps that produce
 * nothing a model can serve, and cap the length. Returns [] when fewer than
 * two usable steps remain — the caller should then treat the task as single.
 */
export function normalizeSegments(segments: IntentSegment[] | undefined): PlanStep[] {
  const steps: PlanStep[] = [];
  for (const seg of segments ?? []) {
    const valid = seg.requiredCapabilities.filter((cap) => KNOWN_CAPS.has(cap));
    const producing = valid.filter((cap) => !MODIFIER_CAPS.has(cap));
    const rawLabel = seg.step?.trim() ?? "";
    // a capability-less editing/muxing step is post-production, not a model step
    if (producing.length === 0 && ASSEMBLY_RE.test(rawLabel)) continue;
    const primary = producing[0] ?? inferCapability(seg.inputModality, seg.outputModality);
    if (!primary) continue;
    const capabilities = [primary, ...valid.filter((cap) => cap !== primary)];
    const label = rawLabel || defaultLabel(primary);
    steps.push({
      index: steps.length + 1,
      label,
      inputModality: seg.inputModality,
      outputModality: seg.outputModality,
      primaryCapability: primary,
      capabilities,
      scene: resolveStepScene(seg.scene, label, primary),
    });
    if (steps.length >= MAX_STEPS) break;
  }
  return steps.length >= 2 ? steps : [];
}

/**
 * Step scene: the LLM's per-step scene when it fits the capability, else a
 * label keyword match that fits the capability, else none.
 */
function resolveStepScene(
  llmScene: string | undefined,
  label: string,
  cap: string,
): string | undefined {
  const fits = (scene: string) => (CAP_SCENES[cap] ?? []).includes(scene);
  if (llmScene && fits(llmScene)) return llmScene;
  for (const [pattern, scene] of LABEL_SCENE_RULES) {
    if (pattern.test(label) && fits(scene)) return scene;
  }
  // e.g. a generic VG step means plain video generation, not lip-sync or style transfer
  return CAP_DEFAULT_SCENE[cap];
}

/**
 * Scenes used to score this step: its own scene when known; otherwise the
 * user's scenes that belong to the step's capability.
 */
export function stepScenes(step: PlanStep, intent: IntentProfile): string[] {
  if (step.scene) return [step.scene];
  const relevant = new Set(CAP_SCENES[step.primaryCapability] ?? []);
  return intent.matchedScenes.filter((scene) => relevant.has(scene));
}

/**
 * Per-step view of the user's intent: the step's own modalities and
 * capability, while global preferences (budget, quality, excludes) carry over.
 * Feature requirements (function-calling etc.) only apply to text steps.
 */
export function stepIntent(step: PlanStep, intent: IntentProfile): IntentProfile {
  return {
    ...intent,
    complexity: "single",
    segments: undefined,
    inputModality: step.inputModality,
    outputModality: step.outputModality,
    requiredCapabilities: [step.primaryCapability],
    requiredFeatures: step.primaryCapability === "TG" ? intent.requiredFeatures : [],
    matchedScenes: stepScenes(step, intent),
  };
}
