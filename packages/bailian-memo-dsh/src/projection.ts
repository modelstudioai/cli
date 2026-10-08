/**
 * Session projection for recall / curation bookkeeping (compaction-aware).
 */

import { z } from "zod";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";

export const MEMO_SOURCE_KIND = "bailian-memo-recall" as const;

export interface MemoProjectionState {
  /** Last turn that already received an automatic recall attempt. */
  lastRecallTurn: number;
  /** Session seq of the newest recall user/message, or null. */
  lastRecallSeq: number | null;
  /** Digest of last injected recall payload (for de-dupe / reinject). */
  lastRecallDigest: string | null;
  /** Last turn that ran curator. */
  lastCurateTurn: number;
  /** Count of curator commits attempted in this session. */
  curatorCommitCount: number;
}

const memoStateSchema = z
  .object({
    lastRecallTurn: z.number().int().min(-1),
    lastRecallSeq: z.number().int().nonnegative().nullable(),
    lastRecallDigest: z.string().nullable(),
    lastCurateTurn: z.number().int().min(-1),
    curatorCommitCount: z.number().int().nonnegative(),
  })
  .strict();

const EMPTY: MemoProjectionState = {
  lastRecallTurn: -1,
  lastRecallSeq: null,
  lastRecallDigest: null,
  lastCurateTurn: -1,
  curatorCommitCount: 0,
};

export const memoProjectionDefinition = {
  key: "bailianMemo" as const,
  stateVersion: 1,
  stateSchema: memoStateSchema,
  init: () => EMPTY,
  apply: (state: MemoProjectionState, event: { type: string; seq: number; data?: unknown }) => {
    switch (event.type) {
      case "user/message": {
        const data = event.data as {
          source?: { kind?: string; turn?: number; digest?: string };
        };
        if (
          data.source?.kind !== MEMO_SOURCE_KIND ||
          data.source.turn === undefined ||
          data.source.digest === undefined
        ) {
          return state;
        }
        return {
          ...state,
          lastRecallTurn: data.source.turn,
          lastRecallSeq: event.seq,
          lastRecallDigest: data.source.digest,
        };
      }
      case "bailian-memo/recall-empty": {
        const data = event.data as { turn: number };
        return { ...state, lastRecallTurn: data.turn };
      }
      case "bailian-memo/curator-finished": {
        const data = event.data as { turn: number; committed: boolean };
        return {
          ...state,
          lastCurateTurn: data.turn,
          curatorCommitCount: state.curatorCommitCount + (data.committed ? 1 : 0),
        };
      }
      default:
        return state;
    }
  },
  wire: {
    viewSchema: memoStateSchema,
    view: (state: MemoProjectionState) => state,
  },
} satisfies ProjectionDefinition<"bailianMemo", MemoProjectionState>;

declare module "@deepseek-ai/dsh-session-projection" {
  interface SessionProjectionStateMap {
    bailianMemo: MemoProjectionState;
  }
  interface SessionProjectionMap {
    bailianMemo: MemoProjectionState;
  }
}

declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap {
    "bailian-memo/recall-empty": {
      turn: number;
      scope?: unknown;
    };
    "bailian-memo/curator-request": {
      turn: number;
      messageSeqs: number[];
      route: { provider: string; model: string };
      system: string;
      messages: import("@deepseek-ai/dsh-llm").Message[];
      maxTokens: number;
    };
    "bailian-memo/curator-finished": {
      turn: number;
      committed: boolean;
      reason?: string;
    };
  }
}
