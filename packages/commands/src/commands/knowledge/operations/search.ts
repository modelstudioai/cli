import {
  knowledgeSearchEndpoint,
  type Client,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
} from "bailian-cli-core";

export function searchKnowledge(
  client: Client,
  workspaceId: string,
  body: KnowledgeSearchRequest,
): Promise<KnowledgeSearchResponse> {
  return client.requestJson({ path: knowledgeSearchEndpoint(workspaceId), method: "POST", body });
}
