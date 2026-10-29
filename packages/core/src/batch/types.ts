export const BATCH_ENDPOINTS = [
  "/v1/chat/completions",
  "/v1/embeddings",
  "/v1/chat/ds-test",
] as const;
export type BatchEndpoint = (typeof BATCH_ENDPOINTS)[number];
export const BATCH_STATUSES = [
  "validating",
  "in_progress",
  "finalizing",
  "completed",
  "failed",
  "expired",
  "cancelling",
  "cancelled",
] as const;
export const BATCH_TERMINAL = new Set<string>(["completed", "failed", "expired", "cancelled"]);
export interface BatchRequest {
  custom_id: string;
  method: "POST";
  url: BatchEndpoint;
  body: Record<string, unknown> & { model: string };
}
export interface BatchJob extends Record<string, unknown> {
  id: string;
  status: string;
  input_file_id?: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
  created_at?: number;
  metadata?: Record<string, string>;
  request_counts?: { total: number; completed: number; failed: number };
  errors?: { data?: Array<{ message?: string; code?: string }> };
}
export interface BatchList extends Record<string, unknown> {
  data: BatchJob[];
  first_id?: string;
  last_id?: string;
  has_more: boolean;
}
export interface BatchCreateParams {
  input_file_id: string;
  endpoint: BatchEndpoint;
  completion_window: string;
  metadata?: Record<string, string>;
}
export interface BatchReport {
  records: number;
  bytes: number;
  model: string;
  endpoint: BatchEndpoint;
  warnings: string[];
}
