import type { Client } from "../client/client.ts";
import {
  batchesPath,
  batchPath,
  batchCancelPath,
  batchFileContentPath,
  batchChatBaseUrl,
  chatPath,
} from "../client/endpoints.ts";
import { batchUsage } from "./validate.ts";
import type { BatchCreateParams, BatchJob, BatchList } from "./types.ts";

export function createBatch(
  client: Client,
  body: BatchCreateParams,
  signal?: AbortSignal,
): Promise<BatchJob> {
  return client.requestJson({ path: batchesPath(), method: "POST", body, signal });
}
export function getBatch(client: Client, batchId: string, signal?: AbortSignal): Promise<BatchJob> {
  return client.requestJson({ path: batchPath(batchId), signal });
}
export function cancelBatch(
  client: Client,
  batchId: string,
  signal?: AbortSignal,
): Promise<BatchJob> {
  return client.requestJson({ path: batchCancelPath(batchId), method: "POST", signal });
}
export interface BatchListParams {
  limit?: number;
  after?: string;
  ds_name?: string;
  input_file_ids?: string[];
  status?: string[];
  create_after?: string;
  create_before?: string;
}
export function listBatches(
  client: Client,
  params: BatchListParams = {},
  signal?: AbortSignal,
): Promise<BatchList> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  return client.requestJson({
    path: batchesPath() + (query.size ? `?${query.toString()}` : ""),
    signal,
  });
}
export function getBatchFileContent(
  client: Client,
  fileId: string,
  signal?: AbortSignal,
): Promise<Response> {
  return client.request({ path: batchFileContentPath(fileId), signal });
}
// 仅保护已知地址；显式 Batch/自定义代理继续使用统一鉴权链解析的 Key。
export function resolveBatchChatEndpoint(client: Client): string {
  const endpoint = client.url(chatPath(), batchChatBaseUrl);
  const host = new URL(endpoint).hostname.toLowerCase();
  const originalHost = new URL(client.baseUrl).hostname.toLowerCase();
  if (
    client.usesTokenPlanEndpoint() ||
    /^dashscope(?:-intl|-us)?\.aliyuncs\.com$/.test(host) ||
    /^dashscope-(?:intl|us)\.aliyuncs\.com$/.test(originalHost)
  )
    batchUsage(
      "--batch needs the Batch host, not a realtime/international/Token Plan endpoint; configure --base-url explicitly.",
      "--batch 不能使用实时、国际站或 Token Plan 端点，请显式配置 Batch --base-url。",
    );
  return endpoint;
}
