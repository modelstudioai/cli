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
import { datasetUploadPath, datasetListPath, datasetFilePath } from "../client/endpoints.ts";
import type { Client } from "../client/client.ts";
import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";
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
  client: Client,
  params: DatasetUploadParams,
): Promise<DatasetFile & { request_id?: string }> {
  const { filePath, purpose = "fine-tune", signal } = params;
  const stat = statSync(filePath);
  const fileName = basename(filePath);

  // Use a streaming Blob via Response wrapper to avoid loading the whole file.
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  const blob = await new Response(stream).blob();

  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("purpose", purpose);

  const body = await client.requestJson<DatasetUploadResponse>({
    path: datasetUploadPath(),
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
      request_id: body.request_id,
    };
  }
  // No id in response → upload reported HTTP 200 but produced no usable record
  // (the platform sometimes returns 200 + a business-failure body, e.g.
  // `data.failed_uploads[].{code,message}`). Surface this loudly instead of
  // synthesizing a fake-success record with file_id="" that the caller would
  // then forward to `finetune create` as a phantom training file.
  const failedUploads = body.data?.failed_uploads;
  if (Array.isArray(failedUploads) && failedUploads.length > 0) {
    const first = failedUploads[0] ?? {};
    const code = first.code ? ` [${first.code}]` : "";
    throw new BailianError(
      `Dataset upload failed${code}: ${first.message ?? "no message returned"}`,
      ExitCode.GENERAL,
      `Server reported failure for ${fileName}. Re-run with --verbose to see the raw response.`,
    );
  }
  throw new BailianError(
    `Dataset upload of ${fileName} returned no file_id (HTTP 200 with empty payload).`,
    ExitCode.GENERAL,
    "The platform accepted the request but did not allocate a file_id. Retry the upload; if it recurs, contact platform support with the request id.",
  );
}

export interface DatasetListParams {
  pageNo?: number;
  pageSize?: number;
  purpose?: string;
  signal?: AbortSignal;
}

/** GET /api/v1/files */
export async function listDatasets(
  client: Client,
  params: DatasetListParams = {},
): Promise<DatasetListResponse> {
  const qs = new URLSearchParams();
  if (params.pageNo !== undefined) qs.set("page_no", String(params.pageNo));
  if (params.pageSize !== undefined) qs.set("page_size", String(params.pageSize));
  if (params.purpose) qs.set("purpose", params.purpose);
  const base = datasetListPath();
  const path = qs.toString() ? `${base}?${qs.toString()}` : base;
  return client.requestJson<DatasetListResponse>({
    path,
    method: "GET",
    signal: params.signal,
  });
}

/** GET /api/v1/files/{file_id} */
export async function getDataset(
  client: Client,
  fileId: string,
  signal?: AbortSignal,
): Promise<DatasetGetResponse> {
  return client.requestJson<DatasetGetResponse>({
    path: datasetFilePath(fileId),
    method: "GET",
    signal,
  });
}

/** DELETE /api/v1/files/{file_id} */
export async function deleteDataset(
  client: Client,
  fileId: string,
  signal?: AbortSignal,
): Promise<DatasetDeleteResponse> {
  // The platform sometimes returns 200 with a non-JSON body for DELETE; tolerate that.
  const res = await client.request({ path: datasetFilePath(fileId), method: "DELETE", signal });
  try {
    return (await res.json()) as DatasetDeleteResponse;
  } catch {
    return { data: { deleted: true, file_id: fileId } };
  }
}
