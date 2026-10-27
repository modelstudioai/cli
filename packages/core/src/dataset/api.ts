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
  /** 已由调用方校验的不可变字节；提供时不再读取 filePath。 */
  fileBlob?: Blob;
  signal?: AbortSignal;
}

/**
 * POST /compatible-mode/v1/files (multipart/form-data)
 *
 * 文件读取通过 Response.blob 聚合，multipart 上传复用 Blob。
 * 提供 fileBlob 时不再读取源路径，保证校验和上传的字节一致。
 */
export async function uploadDataset(
  client: Client,
  params: DatasetUploadParams,
): Promise<DatasetFile & { request_id?: string }> {
  const { filePath, purpose = "fine-tune", signal } = params;
  const size = params.fileBlob?.size ?? statSync(filePath).size;
  const fileName = basename(filePath);

  // Response.blob 会聚合字节；Batch 调用方直接提供同一份已校验 Blob。
  const blob =
    params.fileBlob ??
    (await new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream).blob());

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
      size: body.bytes ?? size,
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
    throw new BailianError(
      first.message ??
        "Upload failed without a service message. / 上传失败，服务端未提供错误消息。",
      ExitCode.GENERAL,
      undefined,
      {
        api: { httpStatus: 200, apiCode: first.code, requestId: body.request_id },
        rawResponse: JSON.stringify(body),
      },
    );
  }
  throw new BailianError(
    `Upload response for ${fileName} has no usable file ID. / ${fileName} 的上传响应缺少可用文件 ID。`,
    ExitCode.GENERAL,
    "Success cannot be verified; inspect the file list before retrying. / 无法验证上传成功，请先检查文件列表，再决定是否重试。",
    { api: { httpStatus: 200, requestId: body.request_id }, rawResponse: JSON.stringify(body) },
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
