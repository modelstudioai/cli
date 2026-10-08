/**
 * Plugin Config: Volatile fields project into the Host settings document (dsh 0.2.1).
 */

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { PLUGIN_ENTRY_ID } from "./plugin-meta.js";

/** Settings namespace / Loader entry id. */
export const MEMO_SETTINGS_NAMESPACE = PLUGIN_ENTRY_ID;

export interface Config {
  /** Master switch for automatic recall + curation (tools still work when paused via personal config). */
  enabled: Volatile<boolean>;
  /** Inject recalled memories on top-level turn first steps. */
  autoRecall: Volatile<boolean>;
  /** Run silent curator on turn-stopping. */
  autoCurate: Volatile<boolean>;
  /** Search top_k for automatic recall. */
  recallTopK: Volatile<number>;
  /** Minimum similarity for automatic recall and for search when min_score is omitted. */
  minScore: Volatile<number>;
  /** Auxiliary curator max output tokens. */
  curatorMaxOutputTokens: Volatile<number>;
  /** Auxiliary curator deadline in milliseconds. */
  curatorTimeoutMs: Volatile<number>;
  /** Optional explicit curator provider (must pair with model). */
  curatorProvider: Volatile<string | undefined>;
  /** Optional explicit curator model id. */
  curatorModel: Volatile<string | undefined>;
  /** Optional DashScope endpoint host override. */
  endpointHost: Volatile<string | undefined>;
}

// Volatile schema inference does not round-trip through `z<Config>`; cast for
// portable declaration emit (same pattern as out-of-tree dsh plugins).
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  autoRecall: z.boolean().default(true).volatile(),
  autoCurate: z.boolean().default(true).volatile(),
  recallTopK: z.number().step(1).min(1).max(20).default(5).volatile(),
  minScore: z.number().min(0).max(1).default(0).volatile(),
  curatorMaxOutputTokens: z.number().step(1).min(64).max(4096).default(512).volatile(),
  curatorTimeoutMs: z.number().step(1).min(1000).max(120000).default(30000).volatile(),
  curatorProvider: z.string().volatile(),
  curatorModel: z.string().volatile(),
  endpointHost: z.string().volatile(),
}) as unknown as z<Config>;

export type ResolvedConfig = {
  enabled: boolean;
  autoRecall: boolean;
  autoCurate: boolean;
  recallTopK: number;
  minScore: number;
  curatorMaxOutputTokens: number;
  curatorTimeoutMs: number;
  curatorProvider: string | undefined;
  curatorModel: string | undefined;
  endpointHost: string | undefined;
};

export function resolveConfig(config: Config): ResolvedConfig {
  return {
    enabled: config.enabled.get(),
    autoRecall: config.autoRecall.get(),
    autoCurate: config.autoCurate.get(),
    recallTopK: config.recallTopK.get(),
    minScore: config.minScore.get(),
    curatorMaxOutputTokens: config.curatorMaxOutputTokens.get(),
    curatorTimeoutMs: config.curatorTimeoutMs.get(),
    curatorProvider: config.curatorProvider.get(),
    curatorModel: config.curatorModel.get(),
    endpointHost: config.endpointHost.get(),
  };
}
