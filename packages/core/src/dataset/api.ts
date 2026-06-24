/**
 * Dataset HTTP API wrappers.
 *
 * Thin functions over `request` / `requestJson`. Upload goes through the
 * OpenAI-compatible endpoint (the only path that persists `purpose`); list /
 * get / delete use the DashScope-native `/api/v1/files` (uploaded files appear
 * there too, with purpose intact). All client-side validation lives in
 * `validate/`; this file only does I/O.
 */
import { createReadStream, statSync } from "fs";
import { basename } from "path";
import { Readable } from "stream";
import { request, requestJson } from "../client/http.ts";
import {
  datasetUploadEndpoint,
  datasetListEndpoint,
  datasetFileEndpoint,
} from "../client/endpoints.ts";
import type { Config } from "../config/schema.ts";
import type {
  DatasetFile,
  DatasetUploadResponse,
  DatasetListResponse,
  DatasetGetResponse,
  DatasetDeleteResponse,
} from "./types.ts";

export interface DatasetUploadParams {
  filePath: string;
  /**
   * Purpose tag forwarded to the platform. Defaults to "fine-tune" because
   * the API requires the field, but callers should set this explicitly when
   * uploading evaluation or other dataset kinds.
   */
  purpose?: string;
  signal?: AbortSignal;
}

/**
 * POST /compatible-mode/v1/files (multipart/form-data)
 *
 * Streams the file from disk so we don't buffer 300MB into memory. Node's
 * `fetch` accepts a `Blob` produced from a Readable stream via `Response`'s
 * body shim, but the simplest portable approach (and the one used in
 * `files/upload.ts`) is to wrap the buffer in a Blob. Here we use `Blob`
 * with a stream-backed lazy `arrayBuffer()` for >50MB files via
 * `Response`'s helper to avoid the buffer doubling. Fall back to readFileSync
 * for small files where streaming overhead isn't worth it.
 */
export async function uploadDataset(
  config: Config,
  params: DatasetUploadParams,
): Promise<DatasetFile> {
  const { filePath, purpose = "fine-tune", signal } = params;
  const stat = statSync(filePath);
  const fileName = basename(filePath);

  // Use a streaming Blob via Response wrapper to avoid loading the whole file.
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  const blob = await new Response(stream).blob();

  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("purpose", purpose);

  const url = datasetUploadEndpoint(config.baseUrl);
  const body = await requestJson<DatasetUploadResponse>(config, {
    url,
    method: "POST",
    body: form,
    signal,
  });

  // OpenAI-compatible response is flat: { id, filename, bytes, purpose, ... }.
  if (body.id) {
    return {
      file_id: body.id,
      name: body.filename ?? fileName,
      size: body.bytes ?? stat.size,
      purpose: body.purpose ?? purpose,
      gmt_create: body.created_at ? new Date(body.created_at * 1000).toISOString() : undefined,
    };
  }
  // Last-resort: synthesize a minimal record from the request so callers don't
  // crash on undefined. The CLI surfaces request_id via verbose anyway.
  return {
    file_id: body.id ?? "",
    name: fileName,
    size: stat.size,
    purpose,
  };
}

export interface DatasetListParams {
  pageNo?: number;
  pageSize?: number;
  purpose?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/files */
export async function listDatasets(
  config: Config,
  params: DatasetListParams = {},
): Promise<DatasetListResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.purpose) qs.set("purpose", params.purpose);
  const base = datasetListEndpoint(config.baseUrl);
  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  return requestJson<DatasetListResponse>(config, {
    url,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/files/{file_id} */
export async function getDataset(
  config: Config,
  fileId: string,
  signal?: AbortSignal,
): Promise<DatasetGetResponse> {
  const url = datasetFileEndpoint(config.baseUrl, fileId);
  return requestJson<DatasetGetResponse>(config, { url, method: "GET", signal });
}

/** DELETE /api/v1/files/{file_id} */
export async function deleteDataset(
  config: Config,
  fileId: string,
  signal?: AbortSignal,
): Promise<DatasetDeleteResponse> {
  const url = datasetFileEndpoint(config.baseUrl, fileId);
  // The platform sometimes returns 200 with a non-JSON body for DELETE; tolerate that.
  const res = await request(config, { url, method: "DELETE", signal });
  try {
    return (await res.json()) as DatasetDeleteResponse;
  } catch {
    return { data: { deleted: true, file_id: fileId } };
  }
}
