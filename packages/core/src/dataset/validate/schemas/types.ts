/**
 * Record-schema spec — the per-record dispatcher contract for `.jsonl`.
 *
 * The file format registry in `registry.ts` routes "which validator owns this
 * extension" (today only `jsonl.ts`). Within a single .jsonl file there can
 * still be multiple *record* schemas — e.g. SFT (ChatML) vs DPO. This sub-
 * registry handles that finer-grained dispatch.
 *
 * Adding a new record schema:
 *   1. Create `<schema>.ts` exporting a `RecordSchemaSpec` constant.
 *   2. Append it to `RECORD_SCHEMAS` (more specific schemas FIRST so auto-
 *      detect picks them before the fallback).
 *   3. Add the schema id to the `DatasetSchema` union in `../types.ts` and to
 *      `parseDatasetSchemaFlag` in `../common.ts`.
 * That's it — `jsonl.ts` only knows about the dispatch interface.
 */
import type { DatasetSchema, ValidationIssue } from "../types.ts";

export interface RecordSchemaSpec {
  /** Schema id — must match a value in the `DatasetSchema` union. */
  name: DatasetSchema;
  /**
   * Auto-detect this schema for an arbitrary record when no `--schema` is
   * given. The registry walks entries in declared order and picks the first
   * match, so place more specific schemas before more general ones.
   */
  detect(record: Record<string, unknown>): boolean;
  /** Run schema-specific structural checks on the parsed record. */
  inspect(record: Record<string, unknown>, lineNo: number): ValidationIssue[];
}
