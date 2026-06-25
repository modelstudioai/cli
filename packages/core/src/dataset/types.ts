/**
 * Dataset API types.
 *
 * Maps DashScope `/api/v1/files` responses. The same endpoint backs every
 * dataset purpose the platform supports today (fine-tune training,
 * evaluation, etc.) — these types are deliberately purpose-agnostic so new
 * purposes can be plugged in without schema changes.
 */

/** A single uploaded dataset file as returned by the platform. */
export interface DatasetFile {
  /** File ID — the only stable handle for downstream consumers. */
  file_id: string;
  /** Original filename uploaded by the user. */
  name: string;
  /** Bytes. */
  size?: number;
  /** Content hash (server-computed). */
  md5?: string;
  /** Free-form purpose tag, e.g. "fine-tune", "evaluation". */
  purpose?: string;
  /** Optional internal/external URL (kept for parity with the API). */
  url?: string;
  /** Free-form description if the user supplied one at upload time. */
  description?: string;
  /** Server-side creation timestamp (string, format per platform). */
  gmt_create?: string;
}

/** GET /api/v1/files response. */
export interface DatasetListResponse {
  request_id?: string;
  data?: {
    files?: DatasetFile[];
    total?: number;
    page_no?: number;
    page_size?: number;
  };
}

/** GET /api/v1/files/{file_id} response. */
export interface DatasetGetResponse {
  request_id?: string;
  data?: DatasetFile;
}

/**
 * POST /compatible-mode/v1/files response (OpenAI-compatible).
 *
 * Flat shape — there is no `data` envelope on success. `id` is the file handle
 * to pass to fine-tune jobs; `purpose` is echoed back so callers can confirm
 * it landed. On business-level failure (HTTP 200 + `data.failed_uploads`)
 * `id` is absent and `data.failed_uploads[]` carries the platform's reason.
 */
export interface DatasetUploadResponse {
  request_id?: string;
  /** File ID — the handle returned to callers (e.g. `file-ft-…`). */
  id?: string;
  /** Always `"file"` for this endpoint. */
  object?: string;
  /** Bytes. */
  bytes?: number;
  /** Original filename uploaded by the user. */
  filename?: string;
  /** Purpose tag, e.g. `"fine-tune"`, `"file-extract"`, `"batch"`. */
  purpose?: string;
  /** Platform processing state, e.g. `"processed"`. */
  status?: string;
  /** Creation timestamp (Unix seconds). */
  created_at?: number;
  /**
   * Failure envelope: HTTP 200 + business failure. When present the upload
   * did NOT produce a file_id; callers must treat this as an error. Common
   * cause: server-side schema rejection (e.g. malformed JSONL slipped past
   * the local pre-flight).
   */
  data?: {
    failed_uploads?: Array<{
      code?: string;
      message?: string;
      file_name?: string;
    }>;
  };
}

/** DELETE /api/v1/files/{file_id} response. */
export interface DatasetDeleteResponse {
  request_id?: string;
  data?: {
    deleted?: boolean;
    file_id?: string;
  };
}
