// ---- Shared Enums ----

export type Modality = "Text" | "Image" | "Video" | "Audio";
export type Complexity = "single" | "pipeline";
export type Budget = "low" | "medium" | "high";
export type ContextNeed = "standard" | "large" | "extra-large";
export type QualityPreference = "flagship" | "balanced" | "cost-optimized";
export type Capability =
  | "TG"
  | "Reasoning"
  | "VU"
  | "IG"
  | "VG"
  | "TTS"
  | "ASR"
  | "Realtime-ASR"
  | "Realtime-Text-to-Speech"
  | "Realtime-Audio-Translate"
  | "Realtime-Omni"
  | "Multimodal-Omni"
  | "ME"
  | "TR"
  | "3D-generation";
export type Feature =
  | "function-calling"
  | "web-search"
  | "structured-outputs"
  | "prefix-completion";
export type ModelCategory = "Flagship" | "Cost-optimized";
export type PreferenceMode = "unconstrained" | "scoped" | "comparison" | "alternative";

export interface ModelPreference {
  mode: PreferenceMode;
  targets?: string[];
  excludes?: string[];
}

export const Modalities = {
  Text: "Text",
  Image: "Image",
  Video: "Video",
  Audio: "Audio",
} as const;
export const Complexities = { Single: "single", Pipeline: "pipeline" } as const;
export const Budgets = { Low: "low", Medium: "medium", High: "high" } as const;
export const ContextNeeds = {
  Standard: "standard",
  Large: "large",
  ExtraLarge: "extra-large",
} as const;
export const QualityPreferences = {
  Flagship: "flagship",
  Balanced: "balanced",
  CostOptimized: "cost-optimized",
} as const;
export const Capabilities = {
  TG: "TG",
  Reasoning: "Reasoning",
  VU: "VU",
  IG: "IG",
  VG: "VG",
  TTS: "TTS",
  ASR: "ASR",
  RealtimeASR: "Realtime-ASR",
  RealtimeTTS: "Realtime-Text-to-Speech",
  RealtimeAudioTranslate: "Realtime-Audio-Translate",
  RealtimeOmni: "Realtime-Omni",
  MultimodalOmni: "Multimodal-Omni",
  ME: "ME",
  TR: "TR",
  ThreeDGeneration: "3D-generation",
} as const;
export const Features = {
  FunctionCalling: "function-calling",
  WebSearch: "web-search",
  StructuredOutputs: "structured-outputs",
  PrefixCompletion: "prefix-completion",
} as const;
export const ModelCategories = {
  Flagship: "Flagship",
  CostOptimized: "Cost-optimized",
} as const;

// ---- Intent Analysis ----

export interface IntentSegment {
  step: string;
  inputModality: Modality[];
  outputModality: Modality[];
  requiredCapabilities: Capability[];
}

export interface IntentProfile {
  complexity: Complexity;
  segments?: IntentSegment[];

  taskSummary: string;
  scenarioHints: string[];

  inputModality: Modality[];
  outputModality: Modality[];
  requiredCapabilities: Capability[];
  requiredFeatures: Feature[];

  budget: Budget;
  contextNeed: ContextNeed;
  qualityPreference: QualityPreference;
  confidence: number;

  modelPreference?: ModelPreference;
}

// ---- Model Profile ----

export interface ModelPrice {
  type: string;
  unit: string;
  price: string;
}

export interface QpmLimit {
  count_limit: number;
  count_limit_period: number;
  usage_limit: number;
  usage_limit_field: string;
  usage_limit_period: number;
}

export interface ModelProfile {
  model: string;
  name: string;
  description: string;
  provider: string;
  capabilities: string[];
  features: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  docUrl?: string;
  inferenceMetadata?: {
    request_modality?: Modality[];
    response_modality?: Modality[];
  };

  shortDescription?: string;
  category?: ModelCategory;
  collectionTag?: string;
  maxInputTokens?: number;
  prices?: ModelPrice[];
  qpmInfo?: Record<string, QpmLimit>;
  versionTag?: string;
  openSource?: boolean;
  family?: string;
  familyName?: string;
}

export interface RecommendedModel {
  model: string;
  name: string;
  reason: string;
  highlights: string[];
  category?: ModelCategory;
  contextWindow?: number;
  maxOutputTokens?: number;
  docUrl?: string;
}

export interface PipelineStep {
  step: string;
  recommendations: RecommendedModel[];
  warnings?: string[];
}

export interface SingleResult {
  type: "single";
  recommendations: RecommendedModel[];
}

export interface PipelineResult {
  type: "pipeline";
  summary: string;
  steps: PipelineStep[];
}

export type RecommendResult = SingleResult | PipelineResult;
