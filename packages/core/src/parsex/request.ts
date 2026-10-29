import type { Client } from "../client/client.ts";
import { parsexEndpoint } from "../client/endpoints.ts";
import { BailianError } from "../errors/base.ts";
import type {
  ParsexOperation,
  ParsexSubmitRequest,
  ParsexSubmitResponse,
  ParsexResultRequest,
  ParsexResultResponse,
} from "./types.ts";

export async function submitParsexTask(
  client: Client,
  baseUrl: string,
  operation: ParsexOperation,
  body: ParsexSubmitRequest,
): Promise<ParsexSubmitResponse> {
  // Submissions are deliberately never retried: a lost response may hide a created task.
  const response = await client.requestJson<ParsexSubmitResponse>({
    path: parsexEndpoint(baseUrl, operation, "submit"),
    method: "POST",
    body,
  });
  if (typeof response?.data?.biz_id !== "string" || !response.data.biz_id.trim()) {
    throw new BailianError(
      "ParseX response is missing data.biz_id; submission may have succeeded. / ParseX 响应缺少 data.biz_id，任务可能已提交成功。",
      undefined,
      "Check the task before submitting again. / 请核对任务后再决定是否重新提交。",
      { api: { requestId: response?.request_id } },
    );
  }
  return response;
}

export async function getParsexResult(
  client: Client,
  baseUrl: string,
  operation: ParsexOperation,
  body: ParsexResultRequest,
  signal?: AbortSignal,
): Promise<ParsexResultResponse> {
  const response = await client.requestJson<ParsexResultResponse>({
    path: parsexEndpoint(baseUrl, operation, "result"),
    method: "POST",
    body,
    signal,
  });
  if (typeof response?.data?.status !== "string" || !response.data.status.trim()) {
    throw new BailianError(
      "ParseX response is missing data.status. / ParseX 响应缺少 data.status。",
      undefined,
      undefined,
      { api: { requestId: response?.request_id } },
    );
  }
  return response;
}
