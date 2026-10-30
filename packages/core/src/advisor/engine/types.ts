import type { ModelSpecs } from "./specs.ts";

// ---- Shared enums (aligned with catalog data) ----

export type Modality = "Text" | "Image" | "Video" | "Audio";
export type Complexity = "single" | "pipeline";
export type Budget = "low" | "medium" | "high";
export type ContextNeed = "standard" | "large" | "extra-large";
export type QualityPreference = "flagship" | "balanced" | "cost-optimized";
export type FamilyTier = "flagship" | "balanced" | "lightweight";
export type PreferenceMode = "unconstrained" | "scoped" | "comparison" | "alternative";

// ---- 4-dimension routing model ----

/** Dimension 1: does the user have a starting point? → decides Recall */
export type Anchor = "none" | "reference" | "scope" | "existing";

/** Dimension 2: what cognitive operation does the user want? → decides Score/Rank */
export type UserIntent = "match" | "optimize" | "evaluate" | "differentiate";

/** Dimension 3: how many results? → decides Rank truncation */
export type Cardinality = "one" | "few" | "many";

/** Dimension 4: how to express the result? → decides Explain */
export type OutputForm = "recommend" | "compare" | "validate" | "catalog";

export type OptimizeDimension = "price" | "speed" | "context" | "quality";

// ---- Clarify (ambiguity short-circuit) ----

export interface Clarify {
  question: string;
  options: string[];
  defaultIfSkip: string;
  impact: string;
}

// ---- ExecutionPlan: Router output, pipeline execution config ----

export type RecallStrategy = "template" | "structured" | "forced" | "holistic-pool";
export type ScoreStrategy = "none" | "formula" | "holistic";
export type RankStrategy = "template-order" | "score-sort" | "forced-order";
export type ExplainStrategy = "template-text" | "llm-generate" | "llm-compare" | "catalog";

export interface ExecutionPlan {
  recall: RecallStrategy;
  score: ScoreStrategy;
  rank: RankStrategy;
  explain: ExplainStrategy;
  fairness: boolean;
  topN: number;
  routingReason: string;
  /**
   * Multi-step task: run recall/score/rank once per intent segment and return
   * per-step recommendations instead of one flat slate (topN applies per step).
   */
  stepwise?: boolean;
  /** Set when Router detects high-impact ambiguity; pipeline short-circuits. */
  clarify?: Clarify;
}

// ---- Catalog data model ----

export interface ModelPrice {
  type: string;
  unit: string;
  price: string;
}

export interface PipelineRole {
  from: Modality;
  to: Modality;
  role: string;
}

/** LLM-compiled wiki profile embedded in models.jsonl records. */
export interface ModelWikiProfile {
  profileCompleteness: "full" | "partial" | "structured-only";
  oneLinePositioning?: string;
  scenes?: string[];
  notSuitableFor?: string[];
  styleKeywords?: string[];
  familyTier?: FamilyTier | null;
  familyComparison?: string | null;
  openSource?: boolean;
  callModes?: string[];
  pipelineRole?: PipelineRole[];
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
  maxInputTokens?: number;
  docUrl?: string;
  inferenceMetadata?: {
    request_modality?: Modality[];
    response_modality?: Modality[];
  };
  prices?: ModelPrice[];
  versionTag?: string;
  family?: string;
  familyName?: string;
  profile?: ModelWikiProfile;
}

/** Family-level data from families.jsonl (loaded on demand). */
export interface FamilyProfile {
  slug: string;
  name: string;
  description: string;
  primaryCapability: string;
  capabilities: string[];
  itemCount: number;
  items: { model: string; name: string; contextWindow?: number; capabilities: string[] }[];
  maxContextWindow?: number;
}

// ---- Intent analysis ----

export interface ModelPreference {
  mode: PreferenceMode;
  targets?: string[];
  excludes?: string[];
}

export interface IntentSegment {
  step: string;
  /** Scene label (from the 33-scene enum) of this step, e.g. 创意写作 for a script step; optional. */
  scene?: string;
  inputModality: Modality[];
  outputModality: Modality[];
  requiredCapabilities: string[];
}

export interface IntentProfile {
  // ---- Task shape --

  /** Single model task or multi-step pipeline; feeds the router's `pipeline` flag and ambiguity short-circuits. */
  complexity: Complexity;
  /** Pipeline-only step decomposition; each segment's modalities must chain (output of one = input of next). */
  segments?: IntentSegment[];
  /** One-sentence English summary of the core need; injected into explain prompts as task context. */
  taskSummary: string;

  // ---- Soft scenario signals ----

  /** Unstructured hints (e.g. "low-latency", "consumer-facing"); merged with matchedScenes as hard-filter signals. */
  scenarioHints: string[];

  // ---- Modality & capability ----

  /** Input modalities; hard-filter matching and ambiguity detection (known output + missing input triggers clarify). */
  inputModality: Modality[];
  /** Output modalities; same consumers as inputModality. */
  outputModality: Modality[];
  /** Capability codes (TG, IG, VG, TTS, ASR...); hard-filter matching and cross-domain ambiguity detection. */
  requiredCapabilities: string[];
  /** Feature requirements (function-calling, web-search, structured-outputs, prefix-completion); hard-filter matching. */
  requiredFeatures: string[];

  // ---- Hard constraints ----

  /** Cost bound; defaults to "medium". Drives score budgetFit and recall tier sorting. */
  budget: Budget;
  /** Context window need; drives score contextFit thresholds (unknown model context = no penalty). */
  contextNeed: ContextNeed;
  /** Quality/price trade-off; defaults to "balanced". Drives score tierFit and recall sorting. */
  qualityPreference: QualityPreference;

  // ---- Scene mapping (33-scene enum) ----

  /** Scene labels from the 33-scene enum (exact Chinese labels, max 3 by relevance); drives routing sceneHit, hard-filter scene match, explain context. */
  matchedScenes: string[];
  /** Mapping confidence [0,1]; 1.0 exact, 0.5 inferred, 0 none. Drives sceneHit (>= 0.8) and fuzzy (< 0.5) in the router. */
  sceneConfidence: number;

  // ---- Model preference (Dimension 1 input) ----

  /** Models/families the user named: scoped range, comparison, alternative, or explicit excludes; drives anchor detection and forced recall. */
  modelPreference?: ModelPreference;

  // ---- Routing auxiliary signals ----

  /** Result count inferred from wording ("the cheapest" -> one, "list all" -> many); defaults to "few" in the router. */
  cardinalityHint?: Cardinality;
  /** Single-dimension extreme ("fastest" -> speed); switches the router to optimize intent and pure-dimension scoring weights. */
  optimizeDimension?: OptimizeDimension;

  // ---- Fault tolerance ----

  /** 1 = intent LLM succeeded; 0 = LLM call failed and this profile is DEFAULT_INTENT (conservative defaults). */
  confidence: number;
}

// ---- Pipeline data model ----

export interface ScoredCandidate {
  model: ModelProfile;
  /** Structured preference-satisfaction score [0,1]. */
  hardScore: number;
  /** LLM holistic fit score 1-10 (holistic mode only). */
  holisticScore?: number;
  /** Final ranking score. */
  finalScore: number;
  /** Excluded by notSuitableFor. */
  disqualified?: boolean;
}

/** primary/runner-up/exploration: single-task tier slots; primary/alternative: per-step slots of a multi-step plan. */
export type Slot = "primary" | "runner-up" | "exploration" | "alternative";

export interface RankedCandidate extends ScoredCandidate {
  rank: number;
  slot: Slot;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface Recommendation {
  model: string;
  name: string;
  reason: string;
  highlights: string[];
  confidence: ConfidenceLevel;
  slot: Slot;
  docUrl?: string;
  /** 1-based step index when the recommendation belongs to a multi-step plan. */
  step?: number;
  /** Pricing and capability details surfaced to the user. */
  specs?: ModelSpecs;
}

/** Recommendations for one step of a multi-step task. */
export interface StepRecommendation {
  /** 1-based position in the chain. */
  index: number;
  /** Step label from intent analysis (e.g. "剧本创作"). */
  step: string;
  inputModality: Modality[];
  outputModality: Modality[];
  /** Capability codes the step was matched on. */
  capabilities: string[];
  /** Primary first, then the alternative. */
  recommendations: Recommendation[];
  /** Candidates that passed this step's gate. */
  candidatePool: number;
  confidence: ConfidenceLevel;
  /** How strictly candidates were gated: full modality match, relaxed input, or capability only. */
  gate: "strict" | "relaxed-input" | "capability-only";
}

// ---- Pipeline result ----

export interface RecommendSuccess {
  type: "result";
  recommendations: Recommendation[];
  confidence: ConfidenceLevel;
  routingReason: string;
  candidatePool: number;
  intent: IntentProfile;
  /** Non-fatal LLM fallbacks during this run; empty when every LLM stage succeeded. */
  degradations: Degradation[];
  /**
   * Multi-step tasks only: per-step recommendations in chain order.
   * `recommendations` then holds the same items flattened (each tagged with `step`).
   */
  steps?: StepRecommendation[];
  /** Hand-off problems between adjacent steps (e.g. a step's output modality the next model can't take). */
  warnings?: string[];
}

export interface RecommendClarify {
  type: "need_clarify";
  question: string;
  options: string[];
  defaultIfSkip: string;
  impact: string;
  intent: IntentProfile;
}

export type RecommendResult = RecommendSuccess | RecommendClarify;

// ---- Pipeline context ----

export interface RecommendContext {
  input: string;
  intent: IntentProfile;
  models: ModelProfile[];
  plan: ExecutionPlan;
  topN: number;
  llm: LLMClient;
  trace: RecommendTrace;
  signal?: AbortSignal;
  /** Engine decision log (--think); each entry is one line of reasoning. */
  decisionLog?: string[];
}

// ---- Dependency injection ----

export interface RecommendDeps {
  signal?: AbortSignal;
  llm: LLMClient;
  catalog: () => Promise<ModelProfile[]>;
  families?: () => Promise<Map<string, FamilyProfile>>;
  verbose?: boolean;
  /** When provided, the engine appends decision-log lines here (--think). */
  decisionLog?: string[];
  /** When > 0, overrides the router's default slate size (`--top`). */
  topN?: number;
}

// ---- LLM abstraction ----

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface LLMCallOptions {
  model?: string;
  stage?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  chat(messages: Message[], opts?: LLMCallOptions): Promise<string>;
  chatJson<T>(messages: Message[], opts?: LLMCallOptions): Promise<T>;
  chatWithTools(
    messages: Message[],
    tools: ToolDef[],
    opts?: LLMCallOptions,
  ): Promise<ToolResponse>;
}

// ---- Observability ----

export interface RecommendTrace {
  timestamp: string;
  input: string;
  routingReason?: string;
  matchedScenes?: string[];
  sceneConfidence?: number;
  performance: {
    intentMs?: number;
    recallMs?: number;
    scoreMs?: number;
    rankMs?: number;
    explainMs?: number;
    totalMs?: number;
    llmCalls: number;
  };
  /** Stage fallbacks that happened, each with its cause (formatted as "llm-generate→template-text (429 rate_limit)" in logs). */
  degradations: Degradation[];
  /** Set when the run aborted on an LLM failure (intent failure, or a fatal error in any stage). */
  failure?: TraceFailure;
  /** LLM reasoning content captured when --think is enabled. */
  thinking?: ThinkingEntry[];
}

export interface ThinkingEntry {
  stage: string;
  content: string;
}

export interface TraceFailure {
  stage: string;
  kind: string;
  status?: number;
  code?: string;
  requestId?: string;
  message: string;
}

/** Structured degradation for JSON output / programmatic consumers. */
export interface Degradation {
  stage: string;
  fallback: string;
  kind: string;
  status?: number;
  message: string;
}

// ---- Eval ----

export interface EvalExpectation {
  scene?: string;
  path?: RecallStrategy;
  topModels?: string[];
  mustInclude?: string[];
  budget?: Budget;
  anchor?: Anchor;
  output?: OutputForm;
  complexity?: Complexity;
  steps?: number;
  fuzzy?: boolean;
  needClarify?: boolean;
  cardinality?: Cardinality;
  contextNeed?: ContextNeed;
  capabilities?: string[];
  priceLessThan?: string;
}

export interface EvalCase {
  id: number;
  input: string;
  expect: EvalExpectation;
}
