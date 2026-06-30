/**
 * Record-schema registry — single point of truth for "which schemas can a
 * `.jsonl` record carry, and how do we dispatch to the right one?"
 *
 * Routing:
 *   - When `--schema <name>` is given, dispatch by exact name.
 *   - When `--schema` is omitted, walk the registry in declared order and
 *     pick the first entry whose `detect()` returns true. ChatML is the
 *     catch-all fallback (its detect is `true`), so place more specific
 *     schemas BEFORE it.
 *
 * Adding a new schema: see `types.ts` for the recipe.
 */
import type { DatasetSchema } from "../types.ts";
import type { RecordSchemaSpec } from "./types.ts";
import { chatmlSchema } from "./chatml.ts";
import { cptSchema } from "./cpt.ts";
import { dpoSchema } from "./dpo.ts";

// Order matters: DPO (chosen/rejected) and CPT (text) before ChatML (the
// catch-all fallback). Each keys off a distinguishing field so the three
// partition cleanly — DPO never looks like CPT, etc.
export const RECORD_SCHEMAS: RecordSchemaSpec[] = [dpoSchema, cptSchema, chatmlSchema];

/**
 * Pick the right schema for a single parsed record.
 *  - explicit `schema` → exact-name lookup (USAGE-safe: the CLI parser already
 *    rejects unknown values via `parseDatasetSchemaFlag`, so an unknown name
 *    here is an internal bug and falls back to ChatML).
 *  - auto (`schema === undefined`) → first `detect()` match in registry order;
 *    falls back to ChatML when no more specific schema claims the record.
 */
export function pickRecordSchema(
  record: Record<string, unknown>,
  schema?: DatasetSchema,
): RecordSchemaSpec {
  if (schema !== undefined) {
    const found = RECORD_SCHEMAS.find((s) => s.name === schema);
    if (found) return found;
    // Should not happen — CLI vocabulary is enforced before we get here.
    return chatmlSchema;
  }
  return RECORD_SCHEMAS.find((s) => s.detect(record)) ?? chatmlSchema;
}

export type { RecordSchemaSpec } from "./types.ts";
