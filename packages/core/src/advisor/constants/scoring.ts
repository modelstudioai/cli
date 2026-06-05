import { Capabilities } from "../types.ts";
import type { Capability, ContextNeed } from "../types.ts";

export const MAX_CANDIDATES = 50;
export const MIN_CANDIDATES = 10;
export const FALLBACK_THRESHOLD = 5;
export const FAMILY_CANDIDATE_CAP = 3;
export const SNAPSHOT_DATE_RE = /-\d{4}-\d{2}-\d{2}$/;

export const GENERATION_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  Capabilities.IG,
  Capabilities.VG,
  Capabilities.TTS,
  Capabilities.RealtimeTTS,
  Capabilities.ThreeDGeneration,
]);

export const TEXT_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  Capabilities.TG,
  Capabilities.Reasoning,
  Capabilities.ASR,
  Capabilities.RealtimeASR,
  Capabilities.RealtimeAudioTranslate,
  Capabilities.TR,
  Capabilities.ME,
]);

export const CONTEXT_THRESHOLDS: Record<ContextNeed, number> = {
  standard: 0,
  large: 32000,
  "extra-large": 128000,
};
