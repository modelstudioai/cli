import { OPD_MODEL_MATRIX_DOC } from "bailian-cli-runtime";

// Published pure-Model-OPD student/teacher pairs, CN North-2 (Beijing), from
// the official docs "模型与训练单元" section (OPD_MODEL_MATRIX_DOC), checked
// 2026-11-18. All pairs are invite-only; Singapore publishes none. This is a
// point-in-time snapshot of a published doc, not a live API contract: server
// config may move ahead of it, so mismatches only warn, never block.
const PUBLISHED_OPD_PAIRS = new Set([
  "qwen3.5-2b|qwen3.5-27b",
  "qwen3.5-2b|qwen3.5-35b-a3b",
  "qwen3.5-2b|qwen3.5-122b-a10b",
  "qwen3.5-2b|qwen3.5-397b-a17b",
  "qwen3.5-4b|qwen3.5-27b",
  "qwen3.5-4b|qwen3.5-35b-a3b",
  "qwen3.5-4b|qwen3.5-122b-a10b",
  "qwen3.5-4b|qwen3.5-397b-a17b",
  "qwen3.5-9b|qwen3.5-27b",
  "qwen3.5-9b|qwen3.5-35b-a3b",
  "qwen3.5-9b|qwen3.5-122b-a10b",
  "qwen3.5-9b|qwen3.5-397b-a17b",
  "qwen3.5-9b|qwen3.8-flash",
  "qwen3.5-9b|qwen3.8-max",
  "qwen3.5-27b|qwen3.5-122b-a10b",
  "qwen3.5-27b|qwen3.5-397b-a17b",
  "qwen3.5-35b-a3b|qwen3.5-122b-a10b",
  "qwen3.5-35b-a3b|qwen3.5-397b-a17b",
]);

export function isPublishedOpdPair(studentModel: string, teacherModel: string): boolean {
  return PUBLISHED_OPD_PAIRS.has(`${studentModel}|${teacherModel}`);
}

// The doc recommends MTU4 × 24 for every published pair. It is a sizing
// recommendation for the default layout, not an equality constraint: custom
// student layouts have succeeded with less (e.g. 9B←Flash at 16).
export const OPD_RECOMMENDED_MTU_CAPACITY = 24;

export { OPD_MODEL_MATRIX_DOC };
