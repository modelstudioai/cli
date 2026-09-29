import {
  BailianError,
  ExitCode,
  ragEndpoint,
  RAG_PATHS,
  type Client,
  type LocalizedText,
  type RagCreateIndexV2Response,
  type RagJobCreateResponse,
} from "bailian-cli-core";

export function createKnowledgeIndex(
  client: Client,
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<RagCreateIndexV2Response> {
  return client.requestJson({
    path: ragEndpoint(workspaceId, RAG_PATHS.indexCreateV2),
    method: "POST",
    body,
  });
}

export async function importKnowledgeFiles(
  client: Client,
  workspaceId: string,
  indexId: string,
  fileIds: string[],
  localize: (text: LocalizedText) => string,
): Promise<RagJobCreateResponse> {
  if (!fileIds.length || fileIds.some((fileId) => !fileId.trim())) {
    throw new BailianError(
      localize({
        "en-US": "File import requires a nonempty list of nonempty file IDs.",
        "zh-CN": "文件导入必须指定非空文件列表，且文件 ID 不能为空。",
      }),
      ExitCode.USAGE,
    );
  }
  return client.requestJson({
    path: ragEndpoint(workspaceId, RAG_PATHS.indexJobCreate),
    method: "POST",
    body: { indexId, sourceType: "DATA_CENTER_FILE", docIds: fileIds },
  });
}
